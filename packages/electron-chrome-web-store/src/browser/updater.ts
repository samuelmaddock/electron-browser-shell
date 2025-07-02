import * as fs from 'node:fs'
import * as path from 'node:path'
import debug from 'debug'
import { app, powerMonitor, session as electronSession } from 'electron'

import { compareVersions, fetch, getChromeVersion } from './utils'
import { downloadExtensionFromURL } from './installer'
import { WebStoreState } from './types'

const d = debug('electron-chrome-web-store:updater')

interface OmahaResponseBody {
  response: {
    server: string
    protocol: string
    daystart: {
      elapsed_seconds: number
      elapsed_days: number
    }
    app: Array<{
      appid: string
      cohort: string
      status: string
      cohortname: string
      updatecheck: {
        _esbAllowlist: string
        status:
          | 'ok'
          | 'noupdate'
          | 'error-internal'
          | 'error-hash'
          | 'error-osnotsupported'
          | 'error-hwnotsupported'
          | 'error-unsupportedprotocol'
        urls?: {
          url: Array<{
            codebase: string
          }>
        }
        manifest?: {
          version: string
          packages: {
            package: Array<{
              hash_sha256: string
              size: number
              name: string
              fp: string
              required: boolean
            }>
          }
        }
      }
    }>
  }
}

type ExtensionUpdate = {
  extension: Electron.Extension
  id: string
  name: string
  version: string
  url: string
}

const SYSTEM_IDLE_DURATION = 1 * 60 * 60 * 1000 // 1 hour
const UPDATE_CHECK_INTERVAL = 5 * 60 * 60 * 1000 // 5 hours
const MIN_UPDATE_INTERVAL = 3 * 60 * 60 * 1000 // 3 hours

/** Time of last update check */
let lastUpdateCheck: number | undefined

/**
 * Updates are limited to certain URLs for the initial implementation.
 */
const ALLOWED_UPDATE_URLS = new Set(['https://clients2.google.com/service/update2/crx'])

const getSessionId = (() => {
  let sessionId: string
  return () => sessionId || (sessionId = crypto.randomUUID())
})()

const getOmahaPlatform = (): string => {
  switch (process.platform) {
    case 'win32':
      return 'win'
    case 'darwin':
      return 'mac'
    default:
      return process.platform
  }
}

const getOmahaArch = (): string => {
  switch (process.arch) {
    case 'ia32':
      return 'x86'
    case 'x64':
      return 'x64'
    default:
      return process.arch
  }
}

function filterWebStoreExtension(extension: Electron.Extension) {
  const manifest = extension.manifest as chrome.runtime.Manifest
  if (!manifest) return false
  // TODO: implement extension.isFromStore() to check creation flags
  return manifest.key && manifest.update_url && ALLOWED_UPDATE_URLS.has(manifest.update_url)
}

async function fetchAvailableUpdates(extensions: Electron.Extension[]): Promise<ExtensionUpdate[]> {
  if (extensions.length === 0) return []

  const extensionIds = extensions.map((extension) => extension.id)
  const extensionMap: Record<string, Electron.Extension> = extensions.reduce(
    (map, ext) => ({
      ...map,
      [ext.id]: ext,
    }),
    {},
  )

  const chromeVersion = getChromeVersion()
  const url = 'https://update.googleapis.com/service/update2/json'

  // Chrome's extension updater uses its Omaha Protocol.
  // https://chromium.googlesource.com/chromium/src/+/main/docs/updater/protocol_3_1.md
  const body = {
    request: {
      '@updater': 'electron-chrome-web-store',
      acceptformat: 'crx3',
      app: [
        ...extensions.map((extension) => ({
          appid: extension.id,
          updatecheck: {},
          // API always reports 'noupdate' when version is set :thinking:
          // version: extension.version,
        })),
      ],
      os: {
        platform: getOmahaPlatform(),
        arch: getOmahaArch(),
      },
      prodversion: chromeVersion,
      protocol: '3.1',
      requestid: crypto.randomUUID(),
      sessionid: getSessionId(),
      testsource: process.env.NODE_ENV === 'production' ? '' : 'electron_dev',
    },
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Update-Interactivity': 'bg',
      'X-Goog-Update-AppId': extensionIds.join(','),
      'X-Goog-Update-Updater': `chromiumcrx-${chromeVersion}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    d('update response not ok')
    return []
  }

  // Skip safe JSON prefix
  const text = await response.text()
  const prefix = `)]}'\n`
  if (!text.startsWith(prefix)) {
    d('unexpected update response: %s', text)
    return []
  }

  const json = text.substring(prefix.length)
  const result: OmahaResponseBody = JSON.parse(json)

  let updates: ExtensionUpdate[]
  try {
    const apps = result?.response?.app || []
    updates = apps
      // Find extensions with update
      .filter((app) => app.updatecheck.status === 'ok')
      // Collect info
      .map((app) => {
        const extensionId = app.appid
        const extension = extensionMap[extensionId]
        const manifest = app.updatecheck.manifest!
        const pkg = manifest!.packages.package[0]
        return {
          extension,
          id: extensionId,
          version: manifest.version,
          name: pkg.name,
          url: app.updatecheck.urls!.url[0].codebase,
        }
      })
      // Remove extensions without newer version
      .filter((update) => {
        const extension = extensionMap[update.id]
        return compareVersions(extension.version, update.version) < 0
      })
  } catch (error) {
    console.error('Unable to read extension updates response', error)
    return []
  }

  return updates
}

async function updateExtension(session: Electron.Session, update: ExtensionUpdate) {
  const sessionExtensions = session.extensions || session
  const extensionId = update.id
  const oldExtension = update.extension
  d('updating %s %s -> %s', extensionId, oldExtension.version, update.version)

  // Updates must be installed in adjacent directories. Ensure the old install
  // was contained in a versioned directory structure.
  const oldVersionDirectoryName = path.basename(oldExtension.path)
  if (!oldVersionDirectoryName.startsWith(oldExtension.version)) {
    console.error(
      `updateExtension: extension ${extensionId} must conform to versioned directory names`,
      {
        oldPath: oldExtension.path,
      },
    )
    d('skipping %s update due to invalid install path %s', extensionId, oldExtension.path)
    return
  }

  // Download update
  const extensionsPath = path.join(oldExtension.path, '..', '..')
  const updatePath = await downloadExtensionFromURL(update.url, extensionsPath, extensionId)
  d('downloaded update %s@%s', extensionId, update.version)

  // Reload extension if already loaded
  if (sessionExtensions.getExtension(extensionId)) {
    sessionExtensions.removeExtension(extensionId)
    await sessionExtensions.loadExtension(updatePath)
    d('loaded update %s@%s', extensionId, update.version)
  }

  // Remove old version
  await fs.promises.rm(oldExtension.path, { recursive: true, force: true })
}

async function checkForUpdates(session: Electron.Session) {
  // Only check for extensions from the store
  const sessionExtensions = session.extensions || session
  const extensions = sessionExtensions.getAllExtensions().filter(filterWebStoreExtension)
  d('checking for updates: %s', extensions.map((ext) => `${ext.id}@${ext.version}`).join(','))

  const updates = await fetchAvailableUpdates(extensions)
  if (!updates || updates.length === 0) {
    d('no updates found')
    return []
  }

  return updates
}

async function installUpdates(session: Electron.Session, updates: ExtensionUpdate[]) {
  d('updating %d extension(s)', updates.length)
  for (const update of updates) {
    try {
      await updateExtension(session, update)
    } catch (error) {
      console.error(`checkForUpdates: Error updating extension ${update.id}`)
      console.error(error)
    }
  }
}

/**
 * Check session's loaded extensions for updates and install any if available.
 */
export async function updateExtensions(
  session: Electron.Session = electronSession.defaultSession,
): Promise<void> {
  const updates = await checkForUpdates(session)
  if (updates.length > 0) {
    await installUpdates(session, updates)
  }
}

async function maybeCheckForUpdates(session: Electron.Session) {
  const idleState = powerMonitor.getSystemIdleState(SYSTEM_IDLE_DURATION)
  if (idleState !== 'active') {
    d('skipping update check while system is in "%s" idle state', idleState)
    return
  }

  // Determine if enough time has passed to check updates
  if (lastUpdateCheck && Date.now() - lastUpdateCheck < MIN_UPDATE_INTERVAL) {
    return
  }
  lastUpdateCheck = Date.now()

  void updateExtensions(session)
}

export async function initUpdater(state: WebStoreState) {
  const check = () => maybeCheckForUpdates(state.session)

  switch (process.platform) {
    case 'darwin':
      app.on('did-become-active', check)
      break
    case 'win32':
    case 'linux':
      app.on('browser-window-focus', check)
      break
  }

  const updateIntervalId = setInterval(check, UPDATE_CHECK_INTERVAL)
  check()

  app.on('before-quit', (event) => {
    queueMicrotask(() => {
      if (!event.defaultPrevented) {
        d('stopping update checks')
        clearInterval(updateIntervalId)
      }
    })
  })
}
