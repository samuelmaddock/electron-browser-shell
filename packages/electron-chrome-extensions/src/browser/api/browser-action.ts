import { session, ipcMain } from 'electron'
import { EventEmitter } from 'events'
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

export class BrowserActionAPI extends EventEmitter {
  sessionActionMap = new Map<Electron.Session, Map<string, ExtensionActionStore>>()

  constructor() {
    super()

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

  getPopupPath(session: Electron.Session, extensionId: string, tabId: string) {
    const action = this.getAction(session, extensionId)
    return action.tabs[tabId]?.popup?.path
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
    this.emit('clicked', event, extensionId)
  }
}
