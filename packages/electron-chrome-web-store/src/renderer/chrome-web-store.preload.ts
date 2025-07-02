import { contextBridge, ipcRenderer, webFrame } from 'electron'
import {
  ExtensionInstallStatus,
  MV2DeprecationStatus,
  Result,
  WebGlStatus,
} from '../common/constants'

interface WebstorePrivate {
  ExtensionInstallStatus: typeof ExtensionInstallStatus
  MV2DeprecationStatus: typeof MV2DeprecationStatus
  Result: typeof Result
  WebGlStatus: typeof WebGlStatus

  beginInstallWithManifest3: (
    details: unknown,
    callback?: (result: string) => void,
  ) => Promise<string>
  completeInstall: (id: string, callback?: (result: string) => void) => Promise<string>
  enableAppLauncher: (enable: boolean, callback?: (result: boolean) => void) => Promise<boolean>
  getBrowserLogin: (callback?: (result: string) => void) => Promise<string>
  getExtensionStatus: (
    id: string,
    manifestJson: string,
    callback?: (status: string) => void,
  ) => Promise<string>
  getFullChromeVersion: (callback?: (result: string) => void) => Promise<{
    version_number: string
    app_name: string
  }>
  getIsLauncherEnabled: (callback?: (result: boolean) => void) => Promise<boolean>
  getMV2DeprecationStatus: (callback?: (result: string) => void) => Promise<string>
  getReferrerChain: (callback?: (result: unknown[]) => void) => Promise<unknown[]>
  getStoreLogin: (callback?: (result: string) => void) => Promise<string>
  getWebGLStatus: (callback?: (result: string) => void) => Promise<string>
  install: (
    id: string,
    silentInstall: boolean,
    callback?: (result: string) => void,
  ) => Promise<string>
  isInIncognitoMode: (callback?: (result: boolean) => void) => Promise<boolean>
  isPendingCustodianApproval: (id: string, callback?: (result: boolean) => void) => Promise<boolean>
  setStoreLogin: (login: string, callback?: (result: boolean) => void) => Promise<boolean>
}

function updateBranding(appName: string) {
  const update = () => {
    requestAnimationFrame(() => {
      const chromeButtons = Array.from(document.querySelectorAll('span')).filter((node) =>
        node.innerText.includes('Chrome'),
      )

      for (const button of chromeButtons) {
        button.innerText = button.innerText.replace('Chrome', appName)
      }
    })
  }

  // Try twice to ensure branding changes
  update()
  setTimeout(update, 1000 / 60)
}

function getUAProductVersion(userAgent: string, product: string) {
  const regex = new RegExp(`${product}/([\\d.]+)`)
  return userAgent.match(regex)?.[1]
}

function overrideUserAgent() {
  const chromeVersion = getUAProductVersion(navigator.userAgent, 'Chrome') || '133.0.6920.0'
  const userAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
  webFrame.executeJavaScript(
    `(${function (userAgent: string) {
      Object.defineProperty(navigator, 'userAgent', { value: userAgent })
    }})(${JSON.stringify(userAgent)});`,
  )
}

const DEBUG = process.env.NODE_ENV === 'development'

function log(...args: any[]) {
  if (!DEBUG) return
  console.debug(...args)
}

function setupChromeWebStoreApi() {
  let appName: string | undefined

  const setAppName = (name: string) => {
    appName = name
    updateBranding(appName)
  }

  const maybeUpdateBranding = () => {
    if (appName) updateBranding(appName)
  }

  const setExtensionError = (message?: string) => {
    webFrame.executeJavaScript(`
      if (typeof chrome !== 'undefined') {
        if (!chrome.extension) chrome.extension = {};
        chrome.extension.lastError = ${JSON.stringify(message ? { message } : null)};
      }
    `)
  }

  /**
   * Implementation of Chrome's webstorePrivate for Electron.
   */
  const electronWebstore: WebstorePrivate = {
    ExtensionInstallStatus,
    MV2DeprecationStatus,
    Result,
    WebGlStatus,

    beginInstallWithManifest3: async (details, callback) => {
      log('webstorePrivate.beginInstallWithManifest3', details)
      const { result, message } = await ipcRenderer.invoke('chromeWebstore.beginInstall', details)
      log('webstorePrivate.beginInstallWithManifest3 result:', result)
      setExtensionError(result === Result.SUCCESS ? null : message)
      if (callback) callback(result)
      return result
    },

    completeInstall: async (id, callback) => {
      log('webstorePrivate.completeInstall', id)
      const result = await ipcRenderer.invoke('chromeWebstore.completeInstall', id)
      log('webstorePrivate.completeInstall result:', result)
      if (callback) callback(result)
      maybeUpdateBranding()
      return result
    },

    enableAppLauncher: async (enable, callback) => {
      log('webstorePrivate.enableAppLauncher', enable)
      const result = await ipcRenderer.invoke('chromeWebstore.enableAppLauncher', enable)
      log('webstorePrivate.enableAppLauncher result:', result)
      if (callback) callback(result)
      return result
    },

    getBrowserLogin: async (callback) => {
      log('webstorePrivate.getBrowserLogin called')
      const result = await ipcRenderer.invoke('chromeWebstore.getBrowserLogin')
      log('webstorePrivate.getBrowserLogin result:', result)
      if (callback) callback(result)
      return result
    },

    getExtensionStatus: async (id, manifestJson, callback) => {
      log('webstorePrivate.getExtensionStatus', id, { id, manifestJson, callback })
      const result = await ipcRenderer.invoke('chromeWebstore.getExtensionStatus', id, manifestJson)
      log('webstorePrivate.getExtensionStatus result:', id, result)
      if (callback) callback(result)
      maybeUpdateBranding()
      return result
    },

    getFullChromeVersion: async (callback) => {
      log('webstorePrivate.getFullChromeVersion called')
      const result = await ipcRenderer.invoke('chromeWebstore.getFullChromeVersion')
      log('webstorePrivate.getFullChromeVersion result:', result)

      if (result.app_name) {
        setAppName(result.app_name)
        delete result.app_name
      }

      if (callback) callback(result)
      return result
    },

    getIsLauncherEnabled: async (callback) => {
      log('webstorePrivate.getIsLauncherEnabled called')
      const result = await ipcRenderer.invoke('chromeWebstore.getIsLauncherEnabled')
      log('webstorePrivate.getIsLauncherEnabled result:', result)
      if (callback) callback(result)
      return result
    },

    getMV2DeprecationStatus: async (callback) => {
      log('webstorePrivate.getMV2DeprecationStatus called')
      const result = await ipcRenderer.invoke('chromeWebstore.getMV2DeprecationStatus')
      log('webstorePrivate.getMV2DeprecationStatus result:', result)
      if (callback) callback(result)
      return result
    },

    getReferrerChain: async (callback) => {
      log('webstorePrivate.getReferrerChain called')
      const result = await ipcRenderer.invoke('chromeWebstore.getReferrerChain')
      log('webstorePrivate.getReferrerChain result:', result)
      if (callback) callback(result)
      return result
    },

    getStoreLogin: async (callback) => {
      log('webstorePrivate.getStoreLogin called')
      const result = await ipcRenderer.invoke('chromeWebstore.getStoreLogin')
      log('webstorePrivate.getStoreLogin result:', result)
      if (callback) callback(result)
      return result
    },

    getWebGLStatus: async (callback) => {
      log('webstorePrivate.getWebGLStatus called')
      const result = await ipcRenderer.invoke('chromeWebstore.getWebGLStatus')
      log('webstorePrivate.getWebGLStatus result:', result)
      if (callback) callback(result)
      return result
    },

    install: async (id, silentInstall, callback) => {
      log('webstorePrivate.install', { id, silentInstall })
      const result = await ipcRenderer.invoke('chromeWebstore.install', id, silentInstall)
      log('webstorePrivate.install result:', result)
      if (callback) callback(result)
      return result
    },

    isInIncognitoMode: async (callback) => {
      log('webstorePrivate.isInIncognitoMode called')
      const result = await ipcRenderer.invoke('chromeWebstore.isInIncognitoMode')
      log('webstorePrivate.isInIncognitoMode result:', result)
      if (callback) callback(result)
      return result
    },

    isPendingCustodianApproval: async (id, callback) => {
      log('webstorePrivate.isPendingCustodianApproval', id)
      const result = await ipcRenderer.invoke('chromeWebstore.isPendingCustodianApproval', id)
      log('webstorePrivate.isPendingCustodianApproval result:', result)
      if (callback) callback(result)
      return result
    },

    setStoreLogin: async (login, callback) => {
      log('webstorePrivate.setStoreLogin', login)
      const result = await ipcRenderer.invoke('chromeWebstore.setStoreLogin', login)
      log('webstorePrivate.setStoreLogin result:', result)
      if (callback) callback(result)
      return result
    },
  }

  // Expose webstorePrivate API
  contextBridge.exposeInMainWorld('electronWebstore', electronWebstore)

  // Expose chrome.runtime and chrome.management APIs
  const runtime = {
    lastError: null,
    getManifest: async () => {
      log('chrome.runtime.getManifest called')
      return {}
    },
  }
  contextBridge.exposeInMainWorld('electronRuntime', runtime)

  const management = {
    onInstalled: {
      addListener: (callback: () => void) => {
        log('chrome.management.onInstalled.addListener called')
        ipcRenderer.on('chrome.management.onInstalled', callback)
      },
      removeListener: (callback: () => void) => {
        log('chrome.management.onInstalled.removeListener called')
        ipcRenderer.removeListener('chrome.management.onInstalled', callback)
      },
    },
    onUninstalled: {
      addListener: (callback: () => void) => {
        log('chrome.management.onUninstalled.addListener called')
        ipcRenderer.on('chrome.management.onUninstalled', callback)
      },
      removeListener: (callback: () => void) => {
        log('chrome.management.onUninstalled.removeListener called')
        ipcRenderer.removeListener('chrome.management.onUninstalled', callback)
      },
    },
    getAll: (callback: (extensions: any[]) => void) => {
      log('chrome.management.getAll called')
      ipcRenderer.invoke('chrome.management.getAll').then((result) => {
        log('chrome.management.getAll result:', result)
        callback(result)
      })
    },
    setEnabled: async (id: string, enabled: boolean) => {
      log('chrome.management.setEnabled', { id, enabled })
      const result = await ipcRenderer.invoke('chrome.management.setEnabled', id, enabled)
      log('chrome.management.setEnabled result:', result)
      return result
    },
    uninstall: (id: string, options: { showConfirmDialog: boolean }, callback?: () => void) => {
      log('chrome.management.uninstall', { id, options })
      ipcRenderer.invoke('chrome.management.uninstall', id, options).then((result) => {
        log('chrome.management.uninstall result:', result)
        if (callback) callback()
      })
    },
  }
  contextBridge.exposeInMainWorld('electronManagement', management)

  webFrame.executeJavaScript(`
    (function () {
      chrome.webstorePrivate = globalThis.electronWebstore;
      Object.assign(chrome.runtime, electronRuntime);
      Object.assign(chrome.management, electronManagement);
      void 0;
    }());
  `)

  // Fetch app name
  electronWebstore.getFullChromeVersion()

  // Replace branding
  overrideUserAgent()
  process.once('document-start', maybeUpdateBranding)
  if ('navigation' in window) {
    ;(window.navigation as any).addEventListener('navigate', maybeUpdateBranding)
  }
}

if (location.href.startsWith('https://chromewebstore.google.com')) {
  log('Injecting Chrome Web Store API')
  setupChromeWebStoreApi()
}
