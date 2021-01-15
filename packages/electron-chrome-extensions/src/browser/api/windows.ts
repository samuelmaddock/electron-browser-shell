import { BrowserWindow } from 'electron'
import { ExtensionStore } from '../store'

const debug = require('debug')('electron-chrome-extensions:windows')

const getWindowState = (win: BrowserWindow): chrome.windows.Window['state'] => {
  if (win.isMaximized()) return 'maximized'
  if (win.isMinimized()) return 'minimized'
  if (win.isFullScreen()) return 'fullscreen'
  return 'normal'
}

export class WindowsAPI {
  static WINDOW_ID_NONE = -1
  static WINDOW_ID_CURRENT = -2

  constructor(private store: ExtensionStore) {
    store.handle('windows.get', this.get.bind(this))
    // TODO: how does getCurrent differ from getLastFocused?
    store.handle('windows.getCurrent', this.getLastFocused.bind(this))
    store.handle('windows.getLastFocused', this.getLastFocused.bind(this))
    store.handle('windows.getAll', this.getAll.bind(this))
    store.handle('windows.create', this.create.bind(this))
    store.handle('windows.update', this.update.bind(this))
    store.handle('windows.remove', this.remove.bind(this))

    store.on('window-added', this.observeWindow.bind(this))
  }

  private observeWindow(window: Electron.BrowserWindow) {
    const windowId = window.id

    window.on('focus', () => {
      this.onFocusChanged(windowId)
    })

    window.once('closed', () => {
      this.store.windowDetailsCache.delete(windowId)
      this.store.removeWindow(window)
      this.onRemoved(windowId)
    })

    this.onCreated(windowId)

    debug(`Observing window[${windowId}]`)
  }

  private createWindowDetails(win: BrowserWindow) {
    const details: Partial<chrome.windows.Window> = {
      id: win.id,
      focused: win.isFocused(),
      top: win.getPosition()[1],
      left: win.getPosition()[0],
      width: win.getSize()[0],
      height: win.getSize()[1],
      tabs: Array.from(this.store.tabs)
        .filter((tab) => {
          const ownerWindow = this.store.tabToWindow.get(tab)
          return ownerWindow?.isDestroyed() ? false : ownerWindow?.id === win.id
        })
        .map((tab) => this.store.tabDetailsCache.get(tab.id) as chrome.tabs.Tab)
        .filter(Boolean),
      incognito: !win.webContents.session.isPersistent(),
      type: 'normal', // TODO
      state: getWindowState(win),
      alwaysOnTop: win.isAlwaysOnTop(),
      sessionId: 'default', // TODO
    }

    this.store.windowDetailsCache.set(win.id, details)
    return details
  }

  private getWindowDetails(win: BrowserWindow) {
    if (this.store.windowDetailsCache.has(win.id)) {
      return this.store.windowDetailsCache.get(win.id)
    }
    const details = this.createWindowDetails(win)
    return details
  }

  private getWindowFromId(id: number) {
    if (id === WindowsAPI.WINDOW_ID_CURRENT) {
      return this.store.getCurrentWindow()
    } else {
      return this.store.getWindowById(id)
    }
  }

  private get(event: Electron.IpcMainInvokeEvent, windowId: number) {
    const win = this.getWindowFromId(windowId)
    if (!win) return { id: WindowsAPI.WINDOW_ID_NONE }
    return this.getWindowDetails(win)
  }

  private getLastFocused(event: Electron.IpcMainInvokeEvent) {
    const win = this.store.getLastFocusedWindow()
    return win ? this.getWindowDetails(win) : null
  }

  private getAll(event: Electron.IpcMainInvokeEvent) {
    return Array.from(this.store.windows).map(this.getWindowDetails.bind(this))
  }

  private async create(event: Electron.IpcMainInvokeEvent, details: chrome.windows.CreateData) {
    const win = await this.store.createWindow(event, details)
    return this.getWindowDetails(win)
  }

  private async update(
    event: Electron.IpcMainInvokeEvent,
    windowId: number,
    updateProperties: chrome.windows.UpdateInfo = {}
  ) {
    const win = this.getWindowFromId(windowId)
    if (!win) return

    const props = updateProperties

    if (props.state) {
      switch (props.state) {
        case 'maximized':
          win.maximize()
          break
        case 'minimized':
          win.minimize()
          break
        case 'normal': {
          if (win.isMinimized() || win.isMaximized()) {
            win.restore()
          }
          break
        }
      }
    }

    return this.createWindowDetails(win)
  }

  private async remove(
    event: Electron.IpcMainInvokeEvent,
    windowId: number = WindowsAPI.WINDOW_ID_CURRENT
  ) {
    const win = this.getWindowFromId(windowId)
    if (!win) return
    const removedWindowId = win.id
    await this.store.removeWindow(win)
    this.onRemoved(removedWindowId)
  }

  onCreated(windowId: number) {
    const window = this.store.getWindowById(windowId)
    if (!window) return
    const windowDetails = this.getWindowDetails(window)
    this.store.sendToHosts('windows.onCreated', windowDetails)
  }

  onRemoved(windowId: number) {
    this.store.sendToHosts('windows.onRemoved', windowId)
  }

  onFocusChanged(windowId: number) {
    if (this.store.lastFocusedWindowId === windowId) return

    this.store.lastFocusedWindowId = windowId
    this.store.sendToHosts('windows.onFocusChanged', windowId)
  }
}
