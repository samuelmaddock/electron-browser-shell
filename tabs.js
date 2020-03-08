const { EventEmitter } = require('events')
const { BrowserView, ipcMain } = require('electron')

const toolbarHeight = 62

class Tab {
  constructor(parentWindow) {
    this.view = new BrowserView()
    this.id = this.view.webContents.id
    this.window = parentWindow
    this.webContents = this.view.webContents
  }

  destroy() {
    this.webContents = undefined
    this.window.removeBrowserView(this.view)
    this.window = undefined
    this.view.destroy()
    this.view = undefined
  }
  
  loadURL(url) {
    return this.view.webContents.loadURL(url)
  }

  show() {
    const [width, height] = this.window.getSize()
    this.view.setBounds({ x: 0, y: toolbarHeight, width: width / 2, height: height - toolbarHeight });
    this.view.setAutoResize({ width: true, height: true })
  }

  hide() {
    this.view.setBounds({ x: -1000, y: 0, width: 0, height: 0 });
    this.view.setAutoResize({ width: false, height: false })
  }

  reload() {
    this.view.webContents.reload()
  }
}

class Tabs extends EventEmitter {
  tabList = []
  selected = null

  constructor(browserWindow) {
    super()
    this.window = browserWindow

    ipcMain.handle('create-tab', () => { this.create() })
    ipcMain.handle('remove-tab', (_, tabId) => { this.remove(tabId) })
    ipcMain.handle('reload-tab', () => { this.selected.reload() })
    ipcMain.handle('select-tab', (_, tabId) => { this.select(tabId) })
    ipcMain.handle('navigate-tab', (_, url) => { this.selected.loadURL(url) })
  }
  
  destroy() {
    this.tabList.forEach(tab => tab.destroy())
    this.tabList = []
    this.selected = undefined
    this.window.destroy()
    this.window = undefined
  }
  
  get(tabId) {
    return this.tabList.find(tab => tab.id === tabId)
  }

  create() {
    const tab = new Tab(this.window)
    this.tabList.push(tab)
    this.window.addBrowserView(tab.view)
    tab.loadURL('about:blank')
    if (!this.selected) this.selected = tab
    this.emit('tab-created', tab)
    this.select(tab.id)
    return tab
  }

  remove(tabId) {
    const tabIndex = this.tabList.findIndex(tab => tab.id === tabId)
    if (tabIndex < 0) return
    const tab = this.tabList[tabIndex]
    this.tabList.splice(tabIndex, 1)
    tab.destroy()
    if (this.selected === tab) {
      this.selected = undefined
      const nextTab = this.tabList[0]
      if (nextTab) this.select(nextTab.id)
    }
    this.emit('tab-destroyed', tab)
    if (this.tabList.length === 0) {
      this.destroy()
    }
  }

  select(tabId) {
    const tab = this.get(tabId)
    if (!tab) return
    if (this.selected) this.selected.hide()
    tab.show()
    this.selected = tab
    this.emit('tab-selected', tab)
  }
}

exports.Tabs = Tabs
