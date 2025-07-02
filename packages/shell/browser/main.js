const path = require('path')
const { app, session, BrowserWindow, dialog } = require('electron')

const { Tabs } = require('./tabs')
const { ElectronChromeExtensions } = require('electron-chrome-extensions')
const { setupMenu } = require('./menu')
const { buildChromeContextMenu } = require('electron-chrome-context-menu')
const { installChromeWebStore, loadAllExtensions } = require('electron-chrome-web-store')

// https://www.electronforge.io/config/plugins/webpack#main-process-code
const SHELL_ROOT_DIR = path.join(__dirname, '../../')
const ROOT_DIR = path.join(__dirname, '../../../../')
const PATHS = {
  WEBUI: app.isPackaged
    ? path.resolve(process.resourcesPath, 'ui')
    : path.resolve(SHELL_ROOT_DIR, 'browser', 'ui'),
  PRELOAD: path.join(__dirname, '../renderer/browser/preload.js'),
  LOCAL_EXTENSIONS: path.join(ROOT_DIR, 'extensions'),
}

let webuiExtensionId

const getParentWindowOfTab = (tab) => {
  switch (tab.getType()) {
    case 'window':
      return BrowserWindow.fromWebContents(tab)
    case 'browserView':
    case 'webview':
      return tab.getOwnerBrowserWindow()
    case 'backgroundPage':
      return BrowserWindow.getFocusedWindow()
    default:
      throw new Error(`Unable to find parent window of '${tab.getType()}'`)
  }
}

class TabbedBrowserWindow {
  constructor(options) {
    this.session = options.session || session.defaultSession
    this.extensions = options.extensions

    // Can't inheret BrowserWindow
    // https://github.com/electron/electron/issues/23#issuecomment-19613241
    this.window = new BrowserWindow(options.window)
    this.id = this.window.id
    this.webContents = this.window.webContents

    const webuiUrl = `chrome-extension://${webuiExtensionId}/webui.html`
    this.webContents.loadURL(webuiUrl)

    this.tabs = new Tabs(this.window)

    const self = this

    this.tabs.on('tab-created', function onTabCreated(tab) {
      tab.loadURL(options.urls.newtab)

      // Track tab that may have been created outside of the extensions API.
      self.extensions.addTab(tab.webContents, tab.window)
    })

    this.tabs.on('tab-selected', function onTabSelected(tab) {
      self.extensions.selectTab(tab.webContents)
    })

    queueMicrotask(() => {
      // Create initial tab
      const tab = this.tabs.create()

      if (options.initialUrl) {
        tab.loadURL(options.initialUrl)
      }
    })
  }

  destroy() {
    this.tabs.destroy()
    this.window.destroy()
  }

  getFocusedTab() {
    return this.tabs.selected
  }
}

class Browser {
  windows = []

  urls = {
    newtab: 'about:blank',
  }

  constructor() {
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve
    })

    app.whenReady().then(this.init.bind(this))

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        this.destroy()
      }
    })

    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) this.createInitialWindow()
    })

    app.on('web-contents-created', this.onWebContentsCreated.bind(this))
  }

  destroy() {
    app.quit()
  }

  getFocusedWindow() {
    return this.windows.find((w) => w.window.isFocused()) || this.windows[0]
  }

  getWindowFromBrowserWindow(window) {
    return !window.isDestroyed() ? this.windows.find((win) => win.id === window.id) : null
  }

  getWindowFromWebContents(webContents) {
    let window

    if (this.popup && webContents === this.popup.browserWindow?.webContents) {
      window = this.popup.parent
    } else {
      window = getParentWindowOfTab(webContents)
    }

    return window ? this.getWindowFromBrowserWindow(window) : null
  }

  async init() {
    this.initSession()
    setupMenu(this)

    if ('registerPreloadScript' in this.session) {
      this.session.registerPreloadScript({
        id: 'shell-preload',
        type: 'frame',
        filePath: PATHS.PRELOAD,
      })
    } else {
      // TODO(mv3): remove
      this.session.setPreloads([PATHS.PRELOAD])
    }

    this.extensions = new ElectronChromeExtensions({
      license: 'internal-license-do-not-use',
      session: this.session,

      createTab: async (details) => {
        await this.ready

        const win =
          typeof details.windowId === 'number' &&
          this.windows.find((w) => w.id === details.windowId)

        if (!win) {
          throw new Error(`Unable to find windowId=${details.windowId}`)
        }

        const tab = win.tabs.create()

        if (details.url) tab.loadURL(details.url)
        if (typeof details.active === 'boolean' ? details.active : true) win.tabs.select(tab.id)

        return [tab.webContents, tab.window]
      },
      selectTab: (tab, browserWindow) => {
        const win = this.getWindowFromBrowserWindow(browserWindow)
        win?.tabs.select(tab.id)
      },
      removeTab: (tab, browserWindow) => {
        const win = this.getWindowFromBrowserWindow(browserWindow)
        win?.tabs.remove(tab.id)
      },

      createWindow: async (details) => {
        await this.ready

        const win = this.createWindow({
          initialUrl: details.url,
        })
        // if (details.active) tabs.select(tab.id)
        return win.window
      },
      removeWindow: (browserWindow) => {
        const win = this.getWindowFromBrowserWindow(browserWindow)
        win?.destroy()
      },
    })

    // Display <browser-action-list> extension icons.
    ElectronChromeExtensions.handleCRXProtocol(this.session)

    this.extensions.on('browser-action-popup-created', (popup) => {
      this.popup = popup
    })

    // Allow extensions to override new tab page
    this.extensions.on('url-overrides-updated', (urlOverrides) => {
      if (urlOverrides.newtab) {
        this.urls.newtab = urlOverrides.newtab
      }
    })

    const webuiExtension = await this.session.extensions.loadExtension(PATHS.WEBUI)
    webuiExtensionId = webuiExtension.id

    // Wait for web store extensions to finish loading as they may change the
    // newtab URL.
    await installChromeWebStore({
      session: this.session,
      async beforeInstall(details) {
        if (!details.browserWindow || details.browserWindow.isDestroyed()) return

        const title = `Add “${details.localizedName}”?`

        let message = `${title}`
        if (details.manifest.permissions) {
          const permissions = (details.manifest.permissions || []).join(', ')
          message += `\n\nPermissions: ${permissions}`
        }

        const returnValue = await dialog.showMessageBox(details.browserWindow, {
          title,
          message,
          icon: details.icon,
          buttons: ['Cancel', 'Add Extension'],
        })

        return { action: returnValue.response === 0 ? 'deny' : 'allow' }
      },
    })

    if (!app.isPackaged) {
      await loadAllExtensions(this.session, PATHS.LOCAL_EXTENSIONS, {
        allowUnpacked: true,
      })
    }

    await Promise.all(
      this.session.extensions.getAllExtensions().map(async (extension) => {
        const manifest = extension.manifest
        if (manifest.manifest_version === 3 && manifest?.background?.service_worker) {
          await this.session.serviceWorkers.startWorkerForScope(extension.url).catch((error) => {
            console.error(error)
          })
        }
      }),
    )

    this.createInitialWindow()
    this.resolveReady()
  }

  initSession() {
    this.session = session.defaultSession

    // Remove Electron and App details to closer emulate Chrome's UA
    const userAgent = this.session
      .getUserAgent()
      .replace(/\sElectron\/\S+/, '')
      .replace(new RegExp(`\\s${app.getName()}/\\S+`), '')
    this.session.setUserAgent(userAgent)

    this.session.serviceWorkers.on('running-status-changed', (event) => {
      console.info(`service worker ${event.versionId} ${event.runningStatus}`)
    })

    if (process.env.SHELL_DEBUG) {
      this.session.serviceWorkers.once('running-status-changed', () => {
        const tab = this.windows[0]?.getFocusedTab()
        if (tab) {
          tab.webContents.inspectServiceWorker()
        }
      })
    }
  }

  createWindow(options) {
    const win = new TabbedBrowserWindow({
      ...options,
      urls: this.urls,
      extensions: this.extensions,
      window: {
        width: 1280,
        height: 720,
        frame: false,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
          height: 31,
          color: '#39375b',
          symbolColor: '#ffffff',
        },
        webPreferences: {
          sandbox: true,
          nodeIntegration: false,
          enableRemoteModule: false,
          contextIsolation: true,
          worldSafeExecuteJavaScript: true,
        },
      },
    })
    this.windows.push(win)

    if (process.env.SHELL_DEBUG) {
      win.webContents.openDevTools({ mode: 'detach' })
    }

    return win
  }

  createInitialWindow() {
    this.createWindow()
  }

  async onWebContentsCreated(event, webContents) {
    const type = webContents.getType()
    const url = webContents.getURL()
    console.log(`'web-contents-created' event [type:${type}, url:${url}]`)

    if (process.env.SHELL_DEBUG && ['backgroundPage', 'remote'].includes(webContents.getType())) {
      webContents.openDevTools({ mode: 'detach', activate: true })
    }

    webContents.setWindowOpenHandler((details) => {
      switch (details.disposition) {
        case 'foreground-tab':
        case 'background-tab':
        case 'new-window': {
          return {
            action: 'allow',
            outlivesOpener: true,
            createWindow: ({ webContents: guest, webPreferences }) => {
              const win = this.getWindowFromWebContents(webContents)
              const tab = win.tabs.create({ webContents: guest, webPreferences })
              tab.loadURL(details.url)
              return tab.webContents
            },
          }
        }
        default:
          return { action: 'allow' }
      }
    })

    webContents.on('context-menu', (event, params) => {
      const menu = buildChromeContextMenu({
        params,
        webContents,
        extensionMenuItems: this.extensions.getContextMenuItems(webContents, params),
        openLink: (url, disposition) => {
          const win = this.getFocusedWindow()

          switch (disposition) {
            case 'new-window':
              this.createWindow({ initialUrl: url })
              break
            default:
              const tab = win.tabs.create()
              tab.loadURL(url)
          }
        },
      })

      menu.popup()
    })
  }
}

module.exports = Browser
