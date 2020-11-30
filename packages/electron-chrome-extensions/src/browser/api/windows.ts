import { BrowserWindow } from 'electron'
import { ExtensionStore } from '../store'

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
    store.handle('windows.create', this.create.bind(this))
    store.handle('windows.update', this.update.bind(this))
    store.handle('windows.remove', this.remove.bind(this))
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
          return ownerWindow?.id === win.id
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

  private getWindowFromId(sender: Electron.WebContents, id: number) {
    if (id === WindowsAPI.WINDOW_ID_CURRENT) {
      return this.store.tabToWindow.get(sender) || BrowserWindow.fromWebContents(sender)
    } else {
      return BrowserWindow.fromId(id)
    }
  }

  private get(event: Electron.IpcMainInvokeEvent, windowId: number) {
    const win = this.getWindowFromId(event.sender, windowId)
    if (!win) return { id: WindowsAPI.WINDOW_ID_NONE }
    return this.getWindowDetails(win)
  }

  private async create(event: Electron.IpcMainInvokeEvent, details: chrome.windows.CreateData) {
    if (typeof this.store.impl.createWindow !== 'function') {
      return {}
    }

    const win = await this.store.impl.createWindow(event, details)
    const winDetails = this.getWindowDetails(win)

    return winDetails
  }

  private async update(
    event: Electron.IpcMainInvokeEvent,
    windowId: number,
    updateProperties: chrome.windows.UpdateInfo = {}
  ) {
    const win = this.getWindowFromId(event.sender, windowId)
    if (!win || win.webContents.session !== this.store.session) return

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

  private remove(
    event: Electron.IpcMainInvokeEvent,
    windowId: number = WindowsAPI.WINDOW_ID_CURRENT
  ) {
    const win = this.getWindowFromId(event.sender, windowId)
    if (!win || win.webContents.session !== this.store.session) return
    win.close()
  }

  // onRemoved(win) {
  //   sendToHosts('windows.onRemoved', {
  //     windowId: win.id
  //   })
  // }
}
