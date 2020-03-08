const path = require('path')
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
  createPopup,
  observeTab,
  observeExtensionHost
} = require('./extensions.browser.js')

let extension
let mainWindow
let tabs

async function main() {
  session.defaultSession.setPreloads([
    path.join(__dirname, 'extensions.renderer.js')
  ])
  const webuiExtension = await session.defaultSession.loadExtension(
    path.join(__dirname, 'shell')
  )
  extension = await session.defaultSession.loadExtension(path.join(__dirname, 'extensions/cjpalhdlnbpafiamejdnhcphjbkeiagm', '1.24.4_0'))
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

let isCreatingPopup

app.on('web-contents-created', async (event, webContents) => {
  console.log(webContents.getType(), webContents.getURL())

  if (webContents.getType() === 'backgroundPage') {
    webContents.openDevTools({ mode: 'detach', activate: true })
    await new Promise(resolve => setTimeout(resolve, 5e3))

    isCreatingPopup = true
    const popupView = createPopup(mainWindow, extension)
    isCreatingPopup = false
    mainWindow.addBrowserView(popupView)
  }

  if (!mainWindow || webContents === mainWindow.webContents) {
    // this is the main webUI webcontents
    observeExtensionHost(webContents)
  } else if (isCreatingPopup || webContents.getType() === 'backgroundPage') {
    observeExtensionHost(webContents)
  }

  webContents.on('new-window', (event, url, frameName, disposition, options) => {
    event.preventDefault()

    switch (disposition) {
      case 'foreground-tab':
      case 'background-tab':
      case 'new-window':
        const tab = tabs.create()
        tab.loadURL(url)
        break
    }
  })
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(main)
