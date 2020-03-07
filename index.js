const path = require('path')
const { app, session, ipcMain, BrowserWindow, BrowserView } = require('electron')

const { createPopup } = require('./extensions.browser.js')

// app.commandLine.appendSwitch('remote-debugging-port', '9222')

let extension
let mainWindow

async function main() {
  const rect = { width: 1280, height: 720 }
  
  session.defaultSession.setPreloads([path.join(__dirname, 'extensions.renderer.js')])
  // extension = await session.defaultSession.loadExtension(path.join(__dirname, 'cjpalhdlnbpafiamejdnhcphjbkeiagm', '1.24.4_0'))
  mainWindow = new BrowserWindow({
    width: rect.width,
    height: rect.height,
    webPreferences: {
      nodeIntegration: false,
      // extensionViewType: 'EXTENSION_DIALOG'
    }
  })
  // mainWindow.loadURL(`https://www.youtube.com`)
  mainWindow.loadFile(path.join(__dirname, 'shell/webui.html'))
  
  const toolbarHeight = 62
  const contentView = new BrowserView();
  mainWindow.addBrowserView(contentView);
  contentView.setBounds({ x: 0, y: toolbarHeight, width: rect.width, height: rect.height - toolbarHeight });
  contentView.setAutoResize({ width: true, height: true })
  contentView.webContents.loadURL('https://google.com')
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(main)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('web-contents-created', async (event, webContents) => {
  console.log(webContents.getType(), webContents.getURL())

  if (webContents.getType() === 'backgroundPage') {
    webContents.openDevTools({ mode: 'detach', activate: true })
    await new Promise(resolve => setTimeout(resolve, 5e3))

    const popupView = createPopup(mainWindow, extension)
    mainWindow.addBrowserView(popupView)
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

ipcMain.handle('get-extension', async (event, extensionId) => {
  try {
    const extension = await session.defaultSession.getExtension(extensionId)
    return extension
  } catch (e) {
    return {}
  }
})
