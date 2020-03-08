const path = require('path')
const { promises: fs } = require('fs')
const {
  app,
  session,
  ipcMain,
  BrowserWindow
} = require('electron')

const { Tabs } = require('./tabs')
const {
  extensions,
  observeTab,
  observeExtensionHost
} = require('./extensions.browser.js')

let mainWindow
let tabs

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

async function main() {
  session.defaultSession.setPreloads([
    path.join(__dirname, 'extensions.renderer.js')
  ])
  const webuiExtension = await session.defaultSession.loadExtension(
    path.join(__dirname, 'shell')
  )

  await loadExtensions(path.join(__dirname, 'extensions'))

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    frame: false,
    webPreferences: {
      nodeIntegration: true
    }
  })
  mainWindow.loadURL(
    path.join('chrome-extension://', webuiExtension.id, '/webui.html')
  )

  ipcMain.handle('minimize-window', () => mainWindow.minimize())
  ipcMain.handle('maximize-window', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.restore()
    } else {
      mainWindow.maximize()
    }
  })

  tabs = new Tabs(mainWindow)

  extensions.tabs.on('create-tab', (props, callback) => {
    const tab = tabs.create()
    if (props.url) tab.loadURL(props.url)
    if (props.active) tabs.select(tab.id)
    callback(null, tab.id)
  })

  // don't make a window, just make a tab for now
  extensions.windows.on('create-window', (props, callback) => {
    const tab = tabs.create()
    if (props.url) tab.loadURL(props.url)
    if (props.active) tabs.select(tab.id)
    callback(null, tab.id)
  })

  extensions.tabs.on('create-tab-info', tabInfo => {
    const selectedId = tabs.selected ? tabs.selected.id : -1
    Object.assign(tabInfo, {
      active: tabInfo.id === selectedId
    })
  })

  tabs.on('tab-selected', tab => {
    extensions.tabs.onActivated(tab.id)
  })

  tabs.on('tab-created', tab => {
    observeTab(tab.webContents)
  })

  const initialTab = tabs.create()
  initialTab.loadURL('https://www.google.com')

  mainWindow.openDevTools({ mode: 'detach' })
}

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('web-contents-created', async (event, webContents) => {
  console.log(webContents.getType(), webContents.getURL())

  if (webContents.getType() === 'backgroundPage') {
    webContents.openDevTools({ mode: 'detach', activate: true })
  }

  if (!mainWindow || webContents === mainWindow.webContents) {
    // this is the main webUI webcontents
    observeExtensionHost(webContents)
  } else if (isCreatingPopup || webContents.getType() === 'backgroundPage') {
    observeExtensionHost(webContents)
  }

  webContents.on(
    'new-window',
    (event, url, frameName, disposition, options) => {
      event.preventDefault()

      switch (disposition) {
        case 'foreground-tab':
        case 'background-tab':
        case 'new-window':
          const tab = tabs.create()
          tab.loadURL(url)
          break
      }
    }
  )
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(main)
