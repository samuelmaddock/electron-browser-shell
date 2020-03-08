const path = require('path')
const { promises: fs } = require('fs')
const {
  app,
  session,
  ipcMain,
  BrowserWindow,
  BrowserView
} = require('electron')

const { Tabs } = require('./tabs')
const {
  extensions,
  observeTab,
  observeExtensionHost
} = require('./extensions.browser.js')

let webuiExtensionId

const manifestExists = async dirPath => {
  const manifestPath = path.join(dirPath, 'manifest.json')
  try {
    return (await fs.stat(manifestPath)).isFile()
  } catch {
    return false
  }
}

async function loadExtensions(extensionsPath) {
  const subDirectories = await fs.readdir(extensionsPath, {
    withFileTypes: true
  })

  const extensionDirectories = await Promise.all(
    subDirectories
      .filter(dirEnt => dirEnt.isDirectory())
      .map(async dirEnt => {
        const extPath = path.join(extensionsPath, dirEnt.name)

        if (await manifestExists(extPath)) {
          return extPath
        }

        const extSubDirs = await fs.readdir(extPath, {
          withFileTypes: true
        })

        const versionDirPath =
          extSubDirs.length === 1 && extSubDirs[0].isDirectory()
            ? path.join(extPath, extSubDirs[0].name)
            : null

        if (await manifestExists(versionDirPath)) {
          return versionDirPath
        }
      })
      .filter(Boolean)
  )

  return await Promise.all(
    extensionDirectories.map(extPath =>
      session.defaultSession.loadExtension(extPath)
    )
  )
}

class TabbedBrowserWindow {
  constructor(options) {
    // Can't inheret BrowserWindow
    // https://github.com/electron/electron/issues/23#issuecomment-19613241
    this.window = new BrowserWindow(options)
    this.id = this.window.id
    this.webContents = this.window.webContents

    observeExtensionHost(this.webContents)

    const webuiUrl = path.join(
      'chrome-extension://',
      webuiExtensionId,
      '/webui.html'
    )
    this.webContents.loadURL(webuiUrl)

    this.tabs = new Tabs(this.window)

    this.tabs.on('tab-created', function onTabCreated(tab) {
      observeTab(tab.webContents)
      if (options.initialUrl) tab.webContents.loadURL(options.initialUrl)
    })

    this.tabs.on('tab-selected', function onTabSelected(tab) {
      extensions.tabs.onActivated(tab.id)
    })

    setImmediate(() => {
      const initialTab = this.tabs.create()
      initialTab.loadURL(options.initialUrl || 'about:blank')
    })
  }
}

class Browser {
  windows = []

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

  getIpcWindow(event) {
    const { sender } = event
    if (!sender) return

    let senderWindow
    switch (sender.getType()) {
      case 'window':
        senderWindow = BrowserWindow.fromWebContents(sender)
        break
      case 'browserView': {
        const browserView = BrowserView.fromWebContents(sender)
        senderWindow = BrowserWindow.getAllWindows().find(win =>
          win.getBrowserViews().includes(browserView)
        )
        break
      }
    }

    return senderWindow
      ? this.windows.find(win => win.id === senderWindow.id)
      : null
  }

  async init() {
    session.defaultSession.setPreloads([
      path.join(__dirname, 'extensions.renderer.js')
    ])
    const webuiExtension = await session.defaultSession.loadExtension(
      path.join(__dirname, 'ui')
    )
    webuiExtensionId = webuiExtension.id

    const newTabUrl = path.join(
      'chrome-extension://',
      webuiExtensionId,
      'new-tab.html'
    )

    await loadExtensions(path.join(__dirname, '..', 'extensions'))

    ipcMain.handle('minimize-window', event =>
      this.getIpcWindow(event).window.minimize()
    )
    ipcMain.handle('maximize-window', event => {
      const win = this.getIpcWindow(event).window
      if (win.isMaximized()) {
        win.restore()
      } else {
        win.maximize()
      }
    })

    extensions.tabs.on('create-tab', (props, callback) => {
      // TODO: create in other windows
      const tabs = this.windows[0].tabs
      const tab = tabs.create()
      if (props.url) tab.loadURL(props.url || newTabUrl)
      if (props.active) tabs.select(tab.id)
      callback(null, tab.id)
    })

    extensions.windows.on('create-window', (props, callback) => {
      const win = this.createWindow({
        initialUrl: props.url || newTabUrl
      })
      // if (props.active) tabs.select(tab.id)
      callback(null, win.id) // TODO: return tab or window id?
    })

    extensions.tabs.on('create-tab-info', tabInfo => {
      const tabs = this.windows[0].tabs
      const selectedId = tabs.selected ? tabs.selected.id : -1
      Object.assign(tabInfo, {
        active: tabInfo.id === selectedId
      })
    })

    this.createWindow({ initialUrl: newTabUrl })
  }

  createWindow(options) {
    const win = new TabbedBrowserWindow({
      ...options,
      width: 1280,
      height: 720,
      frame: false,
      webPreferences: {
        nodeIntegration: true,
        enableRemoteModule: false
      }
    })
    this.windows.push(win)
  }

  async onWebContentsCreated(event, webContents) {
    console.log(webContents.getType(), webContents.getURL())

    if (webContents.getType() === 'backgroundPage') {
      observeExtensionHost(webContents)
      webContents.openDevTools({ mode: 'detach', activate: true })
    }

    webContents.on(
      'new-window',
      (event, url, frameName, disposition, options) => {
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
      }
    )
  }
}

module.exports = Browser
