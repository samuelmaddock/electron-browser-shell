const path = require('path')
const { promises: fs } = require('fs')
const { app, session, BrowserWindow, Menu, MenuItem, clipboard } = require('electron')

const { Tabs } = require('./tabs')
const { Extensions } = require('electron-chrome-extensions')
const { setupMenu } = require('./menu')
const { setupContextMenu } = require('./context-menu')

let webuiExtensionId

const manifestExists = async (dirPath) => {
  if (!dirPath) return false
  const manifestPath = path.join(dirPath, 'manifest.json')
  try {
    return (await fs.stat(manifestPath)).isFile()
  } catch {
    return false
  }
}

async function loadExtensions(extensionsPath) {
  const subDirectories = await fs.readdir(extensionsPath, {
    withFileTypes: true,
  })

  const extensionDirectories = await Promise.all(
    subDirectories
      .filter((dirEnt) => dirEnt.isDirectory())
      .map(async (dirEnt) => {
        const extPath = path.join(extensionsPath, dirEnt.name)

        if (await manifestExists(extPath)) {
          return extPath
        }

        const extSubDirs = await fs.readdir(extPath, {
          withFileTypes: true,
        })

        const versionDirPath =
          extSubDirs.length === 1 && extSubDirs[0].isDirectory()
            ? path.join(extPath, extSubDirs[0].name)
            : null

        if (await manifestExists(versionDirPath)) {
          return versionDirPath
        }
      })
  )

  const results = []

  for (const extPath of extensionDirectories.filter(Boolean)) {
    console.log(`Loading extension from ${extPath}`)
    const extensionInfo = await session.defaultSession.loadExtension(extPath)
    results.push(extensionInfo)
  }

  return results
}

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

    const extensions = (this.extensions = options.extensions)

    // Can't inheret BrowserWindow
    // https://github.com/electron/electron/issues/23#issuecomment-19613241
    this.window = new BrowserWindow(options.window)
    this.id = this.window.id
    this.webContents = this.window.webContents

    this.extensions.addExtensionHost(this.webContents)

    const webuiUrl = path.join('chrome-extension://', webuiExtensionId, '/webui.html')
    this.webContents.loadURL(webuiUrl)

    this.tabs = new Tabs(this.window)

    this.tabs.on('tab-created', function onTabCreated(tab) {
      extensions.addTab(tab.webContents)
      if (options.initialUrl) tab.webContents.loadURL(options.initialUrl)
    })

    this.tabs.on('tab-selected', function onTabSelected(tab) {
      extensions.selectTab(tab.webContents)
    })

    setImmediate(() => {
      const initialTab = this.tabs.create()
      initialTab.loadURL(options.initialUrl || 'about:blank')
    })
  }

  getFocusedTab() {
    return this.tabs.selected
  }
}

class Browser {
  windows = []
  popupView = null

  constructor() {
    app.whenReady().then(this.init.bind(this))

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        this.destroy()
      }
    })

    app.on('web-contents-created', this.onWebContentsCreated.bind(this))
  }

  destroy() {
    app.quit()
  }

  getFocusedWindow() {
    return this.windows.find((w) => w.window.isFocused()) || this.windows[0]
  }

  getWindowFromWebContents(webContents) {
    const window = getParentWindowOfTab(webContents)
    return window ? this.windows.find((win) => win.id === window.id) : null
  }

  getIpcWindow(event) {
    return event.sender ? this.getWindowFromWebContents(event.sender) : null
  }

  async init() {
    setupMenu(this)

    this.extensions = new Extensions({
      session: session.defaultSession,

      createTab: (event, details) => {
        const win =
          typeof details.windowId === 'number'
            ? this.windows.find((w) => w.id === details.windowId)
            : this.getIpcWindow(event)

        const tab = win.tabs.create()

        if (details.url) tab.loadURL(details.url || newTabUrl)
        if (typeof details.active === 'boolean' ? details.active : true) win.tabs.select(tab.id)

        return tab
      },
      selectTab: (event, tab) => {
        const win = this.getIpcWindow(event)
        win.tabs.select(tab.id)
      },
      removeTab: (event, tab) => {
        const win = this.getIpcWindow(event)
        win.tabs.remove(tab.id)
      },

      createWindow: (event, details) => {
        const win = this.createWindow({
          initialUrl: details.url || newTabUrl,
        })
        // if (details.active) tabs.select(tab.id)
        return win
      }
    })

    const extensionPreload = path.join(
      __dirname,
      '../../electron-chrome-extensions/dist/preload.js'
    )
    const preloads = session.defaultSession.getPreloads()
    session.defaultSession.setPreloads([extensionPreload, ...preloads])

    const webuiExtension = await session.defaultSession.loadExtension(path.join(__dirname, 'ui'))
    webuiExtensionId = webuiExtension.id

    const newTabUrl = path.join('chrome-extension://', webuiExtensionId, 'new-tab.html')

    const installedExtensions = await loadExtensions(path.join(__dirname, '../../../extensions'))
    this.extensions.browserAction.processExtensions(session.defaultSession, installedExtensions)

    this.extensions.on('active-tab-changed', (tab) => {
      const win = this.getWindowFromWebContents(tab)
      win.tabs.select(tab.id)
    })

    this.extensions.on('action-clicked', (event, extensionId) => {
      const win = this.getWindowFromWebContents(event.sender)
      const selectedId = win.tabs.selected ? win.tabs.selected.id : -1

      if (this.popupView) {
        win.removeBrowserView(this.popupView)
        if (this.popupView.webContents.isDevToolsOpened()) {
          this.popupView.webContents.closeDevTools()
        }
        this.popupView = undefined
      } else {
        this.popupView = this.extensions.createPopup(win.window, selectedId, extensionId)
      }
    })

    this.createWindow({ initialUrl: newTabUrl })
  }

  createWindow(options) {
    const win = new TabbedBrowserWindow({
      ...options,
      extensions: this.extensions,
      window: {
        width: 1280,
        height: 720,
        frame: false,
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

    if (process.env.DEBUG) {
      win.webContents.openDevTools({ mode: 'detach' })
    }

    return win
  }

  async onWebContentsCreated(event, webContents) {
    const type = webContents.getType()
    const url = webContents.getURL()
    console.log(`webContents type=${type}, url=${url}`)

    if (
      webContents.getType() === 'backgroundPage' ||
      // TODO: Need changes from this PR for properly assigned background page type
      // https://github.com/electron/electron/pull/22217
      (webContents.getType() === 'remote' && webContents.getURL().startsWith('chrome-extension://'))
    ) {
      this.extensions.addExtensionHost(webContents)
      webContents.openDevTools({ mode: 'detach', activate: true })
    }

    webContents.on('new-window', (event, url, frameName, disposition, options) => {
      event.preventDefault()

      switch (disposition) {
        case 'foreground-tab':
        case 'background-tab':
        case 'new-window':
          const win = this.getIpcWindow(event)
          const tab = win.tabs.create()
          tab.loadURL(url)
          break
      }
    })

    webContents.on('context-menu', (event, params) => {
      setupContextMenu(this, webContents, params)
    })
  }
}

module.exports = Browser
