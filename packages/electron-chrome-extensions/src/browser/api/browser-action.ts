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

  private observers: Set<Electron.WebContents> = new Set()
  private queuedUpdate: boolean = false

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
        // TODO: need to handle case where prop is set to undefined and
        // revert the value to its default
        Object.assign(action, rest)
      }

      this.onUpdate()
    }

    ipcMain.handle('browserAction.setBadgeBackgroundColor', setter('backgroundColor'))
    ipcMain.handle('browserAction.setBadgeText', setter('text'))
    ipcMain.handle('browserAction.setTitle', setter('title'))
    ipcMain.handle('browserAction.setIcon', setter('icon'))
    ipcMain.handle('browserAction.setPopup', setter('popup'))

    // browserAction preload API
    ipcMain.handle('browserAction.getAll', this.getAll.bind(this))
    ipcMain.handle('browserAction.activate', this.onClicked.bind(this))
    ipcMain.handle('browserAction.addObserver', (event) => {
      const { sender: webContents } = event
      this.observers.add(webContents)
      webContents.once('destroyed', () => {
        this.observers.delete(webContents)
      })
    })

    this.setupSession(this.store.session)
  }

  private setupSession(session: Electron.Session) {
    // TODO: Extension events need to be backported from Electron v12
    const _session = session as any

    _session.on('extension-loaded', (event: Electron.Event, extension: Electron.Extension) => {
      this.processExtension(session, extension)
    })

    _session.on('extension-unloaded', (event: Electron.Event, extension: Electron.Extension) => {
      this.removeActions(this.store.session, extension.id)
    })
  }

  private getSessionActions(session: Electron.Session) {
    let sessionActions = this.sessionActionMap.get(session)
    if (!sessionActions) {
      sessionActions = new Map()
      this.sessionActionMap.set(session, sessionActions)
      this.onUpdate()
    }
    return sessionActions
  }

  private getAction(session: Electron.Session, extensionId: string) {
    const sessionActions = this.getSessionActions(session)

    let action = sessionActions.get(extensionId)
    if (!action) {
      action = { tabs: {} }
      sessionActions.set(extensionId, action)
      this.onUpdate()
    }

    return action
  }

  private removeActions(session: Electron.Session, extensionId: string) {
    const sessionActions = this.getSessionActions(session)

    if (sessionActions.has(extensionId)) {
      sessionActions.delete(extensionId)
    }

    if (sessionActions.size === 0) {
      this.sessionActionMap.delete(session)
    }

    this.onUpdate()
  }

  private getPopupUrl(session: Electron.Session, extensionId: string, tabId: number) {
    const action = this.getAction(session, extensionId)
    const popupPath =
      (action.tabs[tabId] && action.tabs[tabId].popup?.path) || action.popup?.path || undefined
    return popupPath && `chrome-extension://${extensionId}/${popupPath}`
  }

  // TODO: Make private after backporting extension registry events
  processExtension(session: Electron.session, extension: Electron.Extension) {
    const manifest = extension.manifest as chrome.runtime.Manifest
    const { browser_action } = manifest
    if (typeof browser_action === 'object') {
      const action = this.getAction(session, extension.id)

      action.title = browser_action.default_title || manifest.name

      const iconImage = getIconImage(extension)
      if (iconImage) action.icon = iconImage.toDataURL()

      if (browser_action.default_popup) {
        action.popup = { path: browser_action.default_popup }
      }
    }
  }

  private getAll(event: Electron.IpcMainInvokeEvent, partition?: string) {
    const ses = partition ? session.fromPartition(partition) : event.sender.session
    const sessionActions = this.sessionActionMap.get(ses)
    return sessionActions
      ? Array.from(sessionActions.entries()).map((val: any) => ({ id: val[0], ...val[1] }))
      : []
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

  private onUpdate() {
    if (this.queuedUpdate) return
    this.queuedUpdate = true
    queueMicrotask(() => {
      this.queuedUpdate = false
      Array.from(this.observers).forEach((observer) => {
        observer.send('browserAction.update')
      })
    })
  }
}
