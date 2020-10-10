import { session, ipcMain, BrowserWindow } from 'electron'
import { EventEmitter } from 'events'
import { PopupView } from '../popup'
import { ExtensionStore } from '../store'
import { getIconImage } from './common'

interface ExtensionAction {
  backgroundColor?: string
  text?: string
  title?: string
  icon?:
    | string
    | {
        path: string
      }
  popup?: {
    path: string
  }
}

interface ExtensionActionStore extends Partial<ExtensionAction> {
  tabs: { [key: string]: ExtensionAction }
}

export class BrowserActionAPI {
  private sessionActionMap = new Map<Electron.Session, Map<string, ExtensionActionStore>>()
  private popup?: PopupView

  constructor(private store: ExtensionStore) {
    const setter = (propName: string) => (
      event: Electron.IpcMainInvokeEvent,
      extensionId: string,
      details: chrome.browserAction.TabDetails
    ) => {
      const senderSession = event.sender.session
      const action = this.getAction(senderSession, extensionId)
      const { tabId, ...rest } = details

      if (details.tabId) {
        const tabAction = action.tabs[details.tabId] || (action.tabs[details.tabId] = {})
        Object.assign(tabAction, rest)
      } else {
        Object.assign(action, rest)
      }
    }

    ipcMain.handle('browserAction.setBadgeBackgroundColor', setter('backgroundColor'))
    ipcMain.handle('browserAction.setBadgeText', setter('text'))
    ipcMain.handle('browserAction.setTitle', setter('title'))
    ipcMain.handle('browserAction.setIcon', setter('icon'))
    ipcMain.handle('browserAction.setPopup', setter('popup'))

    // extended methods for webui
    ipcMain.handle('browserAction.getAll', this.getAll.bind(this))

    ipcMain.handle('click-action', this.onClicked.bind(this))
  }

  private getAction(session: Electron.Session, extensionId: string) {
    let sessionActions = this.sessionActionMap.get(session)
    if (!sessionActions) {
      sessionActions = new Map()
      this.sessionActionMap.set(session, sessionActions)
    }

    let action = sessionActions.get(extensionId)
    if (!action) {
      action = { tabs: {} }
      sessionActions.set(extensionId, action)
    }

    return action
  }

  private getPopupUrl(session: Electron.Session, extensionId: string, tabId: number) {
    const action = this.getAction(session, extensionId)
    const popupPath =
      (action.tabs[tabId] && action.tabs[tabId].popup?.path) || action.popup?.path || undefined
    return popupPath && `chrome-extension://${extensionId}/${popupPath}`
  }

  processExtensions(session: Electron.Session, extensions: Electron.Extension[]) {
    const populate = (extension: Electron.Extension) => {
      const manifest = extension.manifest as chrome.runtime.Manifest
      const { browser_action } = manifest
      if (browser_action) {
        const action = this.getAction(session, extension.id)

        action.title = browser_action.default_title || manifest.name

        const iconImage = getIconImage(extension)
        if (iconImage) action.icon = iconImage.toDataURL()

        if (browser_action.default_popup) {
          action.popup = { path: browser_action.default_popup }
        }
      }
    }

    extensions.forEach(populate)
  }

  private getAll(event: Electron.IpcMainInvokeEvent) {
    const senderSession = event.sender.session || session.defaultSession
    let sessionActions = this.sessionActionMap.get(senderSession)
    if (!sessionActions) return []

    return Array.from(sessionActions.entries()).map((val: any) => ({ id: val[0], ...val[1] }))
  }

  private onClicked(event: Electron.IpcMainInvokeEvent, extensionId: string) {
    if (this.popup) {
      const toggleExtension = !this.popup.isDestroyed() && this.popup.extensionId === extensionId
      this.popup.destroy()
      this.popup = undefined
      if (toggleExtension) return
    }

    // TODO: activeTab needs to be refactored to support one active tab per window
    const { activeTab } = this.store
    if (!activeTab) return

    const popupUrl = this.getPopupUrl(activeTab.session, extensionId, activeTab.id)

    if (popupUrl) {
      const win = BrowserWindow.fromWebContents(activeTab)
      if (win) this.popup = new PopupView(extensionId, win, popupUrl)
    } else {
      // TODO: dispatch click action
    }
  }
}
