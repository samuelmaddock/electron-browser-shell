import * as path from 'node:path'
import { app, powerMonitor } from 'electron'

import { compareVersions, fetch, getChromeVersion } from './utils'
import { downloadCrx } from './installer'

const d = require('debug')('electron-chrome-web-store:updater')

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

const getOmahaPlatform = () => {
  switch (process.platform) {
    case 'win32':
      return 'win'
    case 'darwin':
      return 'mac'
    default:
      return process.platform
  }
}

const getOmahaArch = () => {
  switch (process.arch) {
    case 'ia32':
      return 'x86'
    case 'x64':
      return 'x64'
    default:
      process.arch
  }
}

async function requestExtensionUpdates(extensions: Electron.Extension[]) {
  const extensionIds = extensions.map((extension) => extension.id)
  const extensionMap: Record<string, Electron.Extension> = extensions.reduce(
    (map, ext) => ({
      ...map,
      [ext.id]: ext,
    }),
    {},
  )
  d('checking extensions for updates', extensionIds)

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
    return
  }

  // Skip safe JSON prefix
  const text = await response.text()
  const prefix = `)]}'\n`
  if (!text.startsWith(prefix)) {
    d('unexpected update response: %s', text)
    return
  }

  const json = text.substring(prefix.length)
  const result: OmahaResponseBody = JSON.parse(json)

  let updates: ExtensionUpdate[]
  try {
    updates = result.response.app
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
    return
  }

  return updates
}

async function updateExtension(update: ExtensionUpdate) {
  d('updating %s', update.id)
  const updateDir = path.join(update.extension.path, '..', `${update.version}_0`)
  await downloadCrx(update.url, updateDir)
  d('updated %s', update.id)
  // TODO: load new extension version
}

async function checkForUpdates(extensions: Electron.Extension[]) {
  d('checking for updates', extensions)

  const updates = await requestExtensionUpdates(extensions)
  if (!updates) {
    d('no updates found')
    return
  }

  d('updating %d extensions', updates.length)
  for (const update of updates) {
    await updateExtension(update)
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

  // Only check for extensions from the store
  const extensions = session.getAllExtensions().filter((ext) => {
    const manifest = ext.manifest as chrome.runtime.Manifest
    if (!manifest) return false
    // TODO: implement extension.isFromStore() to check creation flags
    return manifest.key && manifest.update_url && ALLOWED_UPDATE_URLS.has(manifest.update_url)
  })

  if (extensions.length === 0) {
    d('no extensions installed')
    return
  }

  await checkForUpdates(extensions)
}

export async function initUpdater(state: WebStoreState) {
  const check = () => maybeCheckForUpdates(state.session)

  switch (process.platform) {
    case 'darwin':
      app.on('did-become-active', check)
      break
    case 'win32':
      app.on('browser-window-focus', check)
      break
  }

  setInterval(check, UPDATE_CHECK_INTERVAL)
  check()
}
