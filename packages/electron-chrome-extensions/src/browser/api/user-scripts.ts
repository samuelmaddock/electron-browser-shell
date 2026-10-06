import { webContents as electronWebContents, webFrameMain } from 'electron'
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import debug from 'debug'
import { ExtensionContext } from '../context'
import { ExtensionEvent } from '../router'
import { matchesPattern, urlMatchesFilter } from './lib/match-pattern'

const d = debug('electron-chrome-extensions:userScripts')

type RegisteredUserScript = chrome.userScripts.RegisteredUserScript

const getFrameId = (frame: Electron.WebFrameMain) =>
  frame === frame.top ? 0 : frame.frameTreeNodeId

/**
 * chrome.userScripts: registered scripts are injected into matching frames of
 * every tab as each frame commits a navigation.
 *
 * Scripts in the USER_SCRIPT world are injected through the extension's own
 * `chrome.tabs.executeScript`, so they run in the extension's isolated world
 * and can message the extension. Their messages arrive on
 * `runtime.onMessage`/`runtime.onConnect`; `onUserScriptMessage` and
 * `onUserScriptConnect` exist but never fire. MAIN world scripts are run in
 * the page's main world directly.
 *
 * Registrations are kept in memory, so extensions re-register on startup.
 *
 * https://developer.chrome.com/docs/extensions/reference/api/userScripts
 */
export class UserScriptsAPI {
  private scripts = new Map<string, Map<string, RegisteredUserScript>>()

  constructor(private ctx: ExtensionContext) {
    const handle = this.ctx.router.apiHandler()
    const opts = { permission: 'userScripts' as const }
    handle('userScripts.register', this.register, opts)
    handle('userScripts.update', this.update, opts)
    handle('userScripts.unregister', this.unregister, opts)
    handle('userScripts.getScripts', this.getScripts, opts)
    handle('userScripts.configureWorld', this.configureWorld, opts)

    const sessionExtensions = ctx.session.extensions || ctx.session
    sessionExtensions.on('extension-unloaded', (_event, extension) => {
      this.scripts.delete(extension.id)
    })

    this.ctx.store.on('tab-added', (tab: Electron.WebContents) => {
      tab.on('did-frame-navigate', (_e, url, _code, _status, _isMain, processId, routingId) => {
        const frame = webFrameMain.fromId(processId, routingId)
        if (frame) this.injectFrame(tab, frame, url)
      })
    })
  }

  private extensionScripts(extensionId: string) {
    let scripts = this.scripts.get(extensionId)
    if (!scripts) {
      scripts = new Map()
      this.scripts.set(extensionId, scripts)
    }
    return scripts
  }

  private register = ({ extension }: ExtensionEvent, scripts: RegisteredUserScript[]) => {
    const existing = this.extensionScripts(extension.id)
    for (const script of scripts) {
      validate(script)
      if (existing.has(script.id)) throw new Error(`Duplicate script ID '${script.id}'`)
    }
    for (const script of scripts) existing.set(script.id, script)
    d('registered %s', scripts.map((s) => s.id).join(', '))
  }

  private update = ({ extension }: ExtensionEvent, scripts: RegisteredUserScript[]) => {
    const existing = this.extensionScripts(extension.id)
    const merged = scripts.map((script) => {
      const current = existing.get(script.id)
      if (!current) throw new Error(`Script with ID '${script.id}' does not exist`)
      const next = { ...current, ...script }
      validate(next)
      return next
    })
    for (const script of merged) existing.set(script.id, script)
  }

  private unregister = (
    { extension }: ExtensionEvent,
    filter?: chrome.userScripts.UserScriptFilter,
  ) => {
    const existing = this.extensionScripts(extension.id)
    if (!filter?.ids) {
      existing.clear()
      return
    }
    for (const id of filter.ids) existing.delete(id)
  }

  private getScripts = (
    { extension }: ExtensionEvent,
    filter?: chrome.userScripts.UserScriptFilter,
  ): RegisteredUserScript[] => {
    const scripts = [...this.extensionScripts(extension.id).values()]
    return filter?.ids ? scripts.filter((s) => filter.ids!.includes(s.id)) : scripts
  }

  // CSP and messaging are not configurable: USER_SCRIPT world scripts run in
  // the extension's isolated world, which always allows messaging.
  private configureWorld = (
    _event: ExtensionEvent,
    _properties: chrome.userScripts.WorldProperties,
  ) => {}

  private injectFrame(wc: Electron.WebContents, frame: Electron.WebFrameMain, url: string) {
    const isTop = frame === frame.top
    for (const [extensionId, scripts] of this.scripts) {
      for (const script of scripts.values()) {
        if (!isTop && !script.allFrames) continue
        if (!urlMatchesFilter(script, url)) continue
        this.inject(extensionId, script, wc, frame).catch((error) => {
          d('failed to inject %s into %s: %s', script.id, url, error)
        })
      }
    }
  }

  private async inject(
    extensionId: string,
    script: RegisteredUserScript,
    wc: Electron.WebContents,
    frame: Electron.WebFrameMain,
  ) {
    const sessionExtensions = this.ctx.session.extensions || this.ctx.session
    const extension = sessionExtensions.getExtension(extensionId)
    if (!extension) return
    if (!hasHostPermission(extension, frame.url)) {
      throw new Error(`missing host permission for ${frame.url}`)
    }

    const sources = await Promise.all(
      script.js.map((source: chrome.userScripts.ScriptSource) =>
        source.file
          ? readExtensionFile(extension, source.file)
          : Promise.resolve(source.code || ''),
      ),
    )
    const code = sources.join('\n;\n')

    if (script.world === 'MAIN') {
      await frame.executeJavaScript(code)
      return
    }

    const host = findBackgroundHost(this.ctx.session, extension)
    if (!host) throw new Error(`no background page for ${extensionId}`)

    const details = { code, frameId: getFrameId(frame), runAt: script.runAt || 'document_idle' }
    const error = await host.executeJavaScript(
      `new Promise((resolve) => chrome.tabs.executeScript(${wc.id}, ${JSON.stringify(details)}, ` +
        `() => resolve(chrome.runtime.lastError ? chrome.runtime.lastError.message : null)))`,
    )
    if (error) throw new Error(error)
  }
}

function validate(script: RegisteredUserScript) {
  if (!script.id || script.id.startsWith('_')) throw new Error(`Invalid script ID '${script.id}'`)
  if (!script.matches?.length) throw new Error(`Script '${script.id}' must specify matches`)
  if (!script.js?.length) throw new Error(`Script '${script.id}' must specify js`)
  for (const source of script.js) {
    if (!source.code === !source.file) {
      throw new Error(`Script '${script.id}' sources need exactly one of code or file`)
    }
    if (source.file && source.file.split(/[\\/]/).includes('..')) {
      throw new Error(`Script '${script.id}' file must be inside the extension`)
    }
  }
}

/** Reads a file from the extension's directory, refusing anything that resolves outside it. */
async function readExtensionFile(extension: Electron.Extension, file: string) {
  const base = await realpath(extension.path)
  const target = await realpath(path.resolve(base, file.replace(/^\/+/, '')))
  if (!target.startsWith(base + path.sep)) {
    throw new Error(`Script file '${file}' is outside the extension`)
  }
  return readFile(target, 'utf8')
}

/** Whether the extension's manifest grants host access to `url`. */
function hasHostPermission(extension: Electron.Extension, url: string) {
  const manifest = extension.manifest as chrome.runtime.Manifest & { host_permissions?: string[] }
  const hosts = [...(manifest.permissions || []), ...(manifest.host_permissions || [])].filter(
    (p): p is string => typeof p === 'string' && (p === '<all_urls>' || p.includes('://')),
  )
  return hosts.some((pattern) => matchesPattern(pattern, url))
}

function findBackgroundHost(session: Electron.Session, extension: Electron.Extension) {
  return electronWebContents
    .getAllWebContents()
    .find(
      (wc) =>
        wc.session === session &&
        wc.getType() === 'backgroundPage' &&
        wc.getURL().startsWith(extension.url),
    )
}
