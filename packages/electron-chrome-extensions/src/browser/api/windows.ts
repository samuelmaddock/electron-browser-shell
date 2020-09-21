import { ipcMain, BrowserWindow } from 'electron'
import { EventEmitter } from 'events'
import { ExtensionStore } from '../store'
import { getParentWindowOfTab } from './common'

const getWindowState = (win: BrowserWindow): chrome.windows.Window['state'] => {
  if (win.isMaximized()) return 'maximized'
  if (win.isMinimized()) return 'minimized'
  if (win.isFullScreen()) return 'fullscreen'
  return 'normal'
}

export class WindowsAPI extends EventEmitter {
  static WINDOW_ID_NONE = -1
  static WINDOW_ID_CURRENT = -2

  private detailsCache = new WeakMap<Electron.BrowserWindow, Partial<chrome.windows.Window>>()

  constructor(private store: ExtensionStore) {
    super()
    ipcMain.handle('windows.get', this.get.bind(this))
    ipcMain.handle('windows.create', this.create.bind(this))
    ipcMain.handle('windows.update', this.update.bind(this))
  }

  private createWindowDetails(win: BrowserWindow) {
    const details: Partial<chrome.windows.Window> = {
      id: win.id,
      focused: win.isFocused(),
      top: win.getPosition()[1],
      left: win.getPosition()[0],
      width: win.getSize()[0],
      height: win.getSize()[1],
      // TODO:
      // tabs: Array.from(this.state.tabs).filter(tab => {
      //   const ownerWindow = getParentWindowOfTab(tab)
      //   return ownerWindow?.id === win.id
      // }),
      incognito: !win.webContents.session.isPersistent(),
      type: 'normal', // TODO
      state: getWindowState(win),
      alwaysOnTop: win.isAlwaysOnTop(),
      sessionId: 'foobar', // TODO
    }

    this.detailsCache.set(win, details)
    return details
  }

  private getWindowDetails(win: BrowserWindow) {
    if (this.detailsCache.has(win)) {
      return this.detailsCache.get(win)
    }
    const details = this.createWindowDetails(win)
    return details
  }

  private getWindowFromId(sender: Electron.WebContents, id: number) {
    if (id === WindowsAPI.WINDOW_ID_CURRENT) {
      return getParentWindowOfTab(sender)
    } else {
      return BrowserWindow.fromId(id)
    }
  }

  private get(event: Electron.IpcMainInvokeEvent, windowId: number) {
    const win = this.getWindowFromId(event.sender, windowId)
    if (!win) return { id: WindowsAPI.WINDOW_ID_NONE }
    return this.getWindowDetails(win)
  }

  private create(event: Electron.IpcMainInvokeEvent, details: chrome.windows.CreateData) {
    return new Promise((resolve, reject) => {
      this.emit('create-window', details, (err: boolean, windowId: number) => {
        if (err) {
          reject()
        } else {
          const win = BrowserWindow.fromId(windowId)
          resolve(win ? this.getWindowDetails(win) : {})
        }
      })
    })
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

  // onRemoved(win) {
  //   sendToHosts('windows.onRemoved', {
  //     windowId: win.id
  //   })
  // }
}
