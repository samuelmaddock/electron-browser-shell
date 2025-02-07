import * as fs from 'node:fs'
import * as path from 'node:path'
import debug from 'debug'
import { app, ipcMain } from 'electron'

import {
  ExtensionInstallStatus,
  MV2DeprecationStatus,
  Result,
  WebGlStatus,
} from '../common/constants'
import { installExtension } from './installer'
import { ExtensionId, WebStoreState } from './types'

const d = debug('electron-chrome-web-store:api')

const WEBSTORE_URL = 'https://chromewebstore.google.com'

function getExtensionInfo(ext: Electron.Extension) {
  const manifest: chrome.runtime.Manifest = ext.manifest
  return {
    description: manifest.description || '',
    enabled: !manifest.disabled,
    homepageUrl: manifest.homepage_url || '',
    hostPermissions: manifest.host_permissions || [],
    icons: Object.entries(manifest?.icons || {}).map(([size, url]) => ({
      size: parseInt(size),
      url: `chrome://extension-icon/${ext.id}/${size}/0`,
    })),
    id: ext.id,
    installType: 'normal',
    isApp: !!manifest.app,
    mayDisable: true,
    name: manifest.name,
    offlineEnabled: !!manifest.offline_enabled,
    optionsUrl: manifest.options_page
      ? `chrome-extension://${ext.id}/${manifest.options_page}`
      : '',
    permissions: manifest.permissions || [],
    shortName: manifest.short_name || manifest.name,
    type: manifest.app ? 'app' : 'extension',
    updateUrl: manifest.update_url || '',
    version: manifest.version,
  }
}

function getExtensionInstallStatus(
  state: WebStoreState,
  extensionId: ExtensionId,
  manifest?: chrome.runtime.Manifest,
) {
  if (state.denylist?.has(extensionId)) {
    return ExtensionInstallStatus.BLOCKED_BY_POLICY
  }

  if (state.allowlist && !state.allowlist.has(extensionId)) {
    return ExtensionInstallStatus.BLOCKED_BY_POLICY
  }

  if (manifest) {
    if (manifest.manifest_version < 2) {
      return ExtensionInstallStatus.DEPRECATED_MANIFEST_VERSION
    }
  }

  const extensions = state.session.getAllExtensions()
  const extension = extensions.find((ext) => ext.id === extensionId)

  if (!extension) {
    return ExtensionInstallStatus.INSTALLABLE
  }

  if (extension.manifest.disabled) {
    return ExtensionInstallStatus.DISABLED
  }

  return ExtensionInstallStatus.ENABLED
}

async function uninstallExtension(
  { session, extensionsPath }: WebStoreState,
  extensionId: ExtensionId,
) {
  const extensions = session.getAllExtensions()
  const existingExt = extensions.find((ext) => ext.id === extensionId)
  if (existingExt) {
    await session.removeExtension(extensionId)
  }

  const extensionDir = path.join(extensionsPath, extensionId)
  try {
    const stat = await fs.promises.stat(extensionDir)
    if (stat.isDirectory()) {
      await fs.promises.rm(extensionDir, { recursive: true, force: true })
    }
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      console.error(error)
    }
  }
}

interface InstallDetails {
  id: string
  manifest: string
  localizedName: string
  esbAllowlist: boolean
  iconUrl: string
}

async function beginInstall(state: WebStoreState, details: InstallDetails) {
  const extensionId = details.id

  try {
    if (state.installing.has(extensionId)) {
      return { result: Result.INSTALL_IN_PROGRESS }
    }

    let manifest: chrome.runtime.Manifest
    try {
      manifest = JSON.parse(details.manifest)
    } catch {
      return { result: Result.MANIFEST_ERROR }
    }

    const installStatus = getExtensionInstallStatus(state, extensionId, manifest)
    switch (installStatus) {
      case ExtensionInstallStatus.INSTALLABLE:
        break // good to go
      case ExtensionInstallStatus.BLOCKED_BY_POLICY:
        return { result: Result.BLOCKED_BY_POLICY }
      default: {
        d('unable to install extension %s with status "%s"', extensionId, installStatus)
        return { result: Result.UNKNOWN_ERROR }
      }
    }

    state.installing.add(extensionId)
    await installExtension(extensionId, state)
    return { result: Result.SUCCESS }
  } catch (error) {
    console.error('Extension installation failed:', error)
    return {
      result: Result.INSTALL_ERROR,
      message: error instanceof Error ? error.message : String(error),
    }
  } finally {
    state.installing.delete(extensionId)
  }
}

export function registerWebStoreApi(webStoreState: WebStoreState) {
  /** Handle IPCs from the Chrome Web Store. */
  const handle = (
    channel: string,
    handle: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any,
  ) => {
    ipcMain.handle(channel, async function handleWebStoreIpc(event, ...args) {
      d('received %s', channel)

      const senderOrigin = event.senderFrame?.origin
      if (!senderOrigin || !senderOrigin.startsWith(WEBSTORE_URL)) {
        d('ignoring webstore request from %s', senderOrigin)
        return
      }

      const result = await handle(event, ...args)
      d('%s result', channel, result)
      return result
    })
  }

  handle('chromeWebstore.beginInstall', async (event, details: InstallDetails) => {
    const { senderFrame } = event

    d('beginInstall', details)

    const result = await beginInstall(webStoreState, details)

    if (result.result === Result.SUCCESS) {
      queueMicrotask(() => {
        const ext = webStoreState.session.getExtension(details.id)
        if (ext && senderFrame && !senderFrame.isDestroyed()) {
          try {
            senderFrame.send('chrome.management.onInstalled', getExtensionInfo(ext))
          } catch (error) {
            console.error(error)
          }
        }
      })
    }

    return result
  })

  handle('chromeWebstore.completeInstall', async (event, id) => {
    // TODO: Implement completion of extension installation
    return Result.SUCCESS
  })

  handle('chromeWebstore.enableAppLauncher', async (event, enable) => {
    // TODO: Implement app launcher enable/disable
    return true
  })

  handle('chromeWebstore.getBrowserLogin', async () => {
    // TODO: Implement getting browser login
    return ''
  })
  handle('chromeWebstore.getExtensionStatus', async (_event, id, manifestJson) => {
    const manifest = JSON.parse(manifestJson)
    return getExtensionInstallStatus(webStoreState, id, manifest)
  })

  handle('chromeWebstore.getFullChromeVersion', async () => {
    return {
      version_number: process.versions.chrome,
      app_name: app.getName(),
    }
  })

  handle('chromeWebstore.getIsLauncherEnabled', async () => {
    // TODO: Implement checking if launcher is enabled
    return true
  })

  handle('chromeWebstore.getMV2DeprecationStatus', async () => {
    return MV2DeprecationStatus.INACTIVE
  })

  handle('chromeWebstore.getReferrerChain', async () => {
    // TODO: Implement getting referrer chain
    return 'EgIIAA=='
  })

  handle('chromeWebstore.getStoreLogin', async () => {
    // TODO: Implement getting store login
    return ''
  })

  handle('chromeWebstore.getWebGLStatus', async () => {
    await app.getGPUInfo('basic')
    const features = app.getGPUFeatureStatus()
    return features.webgl.startsWith('enabled')
      ? WebGlStatus.WEBGL_ALLOWED
      : WebGlStatus.WEBGL_BLOCKED
  })

  handle('chromeWebstore.install', async (event, id, silentInstall) => {
    // TODO: Implement extension installation
    return Result.SUCCESS
  })

  handle('chromeWebstore.isInIncognitoMode', async () => {
    // TODO: Implement incognito mode check
    return false
  })

  handle('chromeWebstore.isPendingCustodianApproval', async (event, id) => {
    // TODO: Implement custodian approval check
    return false
  })

  handle('chromeWebstore.setStoreLogin', async (event, login) => {
    // TODO: Implement setting store login
    return true
  })

  handle('chrome.runtime.getManifest', async () => {
    // TODO: Implement getting extension manifest
    return {}
  })

  handle('chrome.management.getAll', async (event) => {
    const extensions = webStoreState.session.getAllExtensions()
    return extensions.map(getExtensionInfo)
  })

  handle('chrome.management.setEnabled', async (event, id, enabled) => {
    // TODO: Implement enabling/disabling extension
    return true
  })

  handle(
    'chrome.management.uninstall',
    async (event, id, options: { showConfirmDialog: boolean }) => {
      if (options?.showConfirmDialog) {
        // TODO: confirmation dialog
      }

      try {
        await uninstallExtension(webStoreState, id)
        queueMicrotask(() => {
          event.sender.send('chrome.management.onUninstalled', id)
        })
        return Result.SUCCESS
      } catch (error) {
        console.error(error)
        return Result.UNKNOWN_ERROR
      }
    },
  )
}
