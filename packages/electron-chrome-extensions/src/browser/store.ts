import { BrowserWindow } from 'electron'
import { EventEmitter } from 'events'

export class ExtensionStore {
  tabs = new Set<Electron.WebContents>()
  extensionHosts = new Set<Electron.WebContents>()

  activeTabId?: number
  activeWindowId?: number

  get activeTab() {
    return this.activeTabId ? this.getTabById(this.activeTabId) : undefined
  }
  get activeWindow() {
    return this.activeWindowId ? BrowserWindow.fromId(this.activeWindowId) : undefined
  }

  tabDetailsCache = new Map<number, Partial<chrome.tabs.Tab>>()
  windowDetailsCache = new Map<number, Partial<chrome.windows.Window>>()

  constructor(private emitter: EventEmitter, public session: Electron.Session) {}

  emit(eventName: string, ...args: any[]) {
    this.emitter.emit(eventName, ...args)
  }

  sendToHosts(eventName: string, ...args: any[]) {
    this.extensionHosts.forEach((host) => {
      if (host.isDestroyed()) return
      host.send(eventName, ...args)
    })
  }

  sendToExtensionHost(extensionId: string, eventName: string, ...args: any[]) {
    const extensionPath = `chrome-extension://${extensionId}/`
    const extensionHost = Array.from(this.extensionHosts).find(
      (host) => !host.isDestroyed() && host.getURL().startsWith(extensionPath)
    )
    if (extensionHost) {
      extensionHost.send(eventName, ...args)
    } else {
      // TODO: need to wake up terminated lazy background hosts
      throw new Error(
        `[Extensions] Unable to send '${eventName}' to extension host for ${extensionId}`
      )
    }
  }

  getTabById(tabId: number) {
    return Array.from(this.tabs).find((tab) => !tab.isDestroyed() && tab.id === tabId)
  }

  createTab(event: Electron.IpcMainInvokeEvent, details: chrome.tabs.CreateProperties) {
    return new Promise<Electron.WebContents>((resolve, reject) => {
      this.emit('create-tab', event, details, (err: boolean | undefined, tabId: number) => {
        if (err) reject(err)
        const tab = this.getTabById(tabId)
        if (!tab) reject()
        resolve(tab)
      })
    })
  }
}
