import { BrowserWindow } from 'electron'
import { EventEmitter } from 'events'
import { ChromeExtensionImpl } from './impl'

export class ExtensionStore {
  tabs = new Set<Electron.WebContents>()
  extensionHosts = new Set<Electron.WebContents>()

  activeTabId?: number

  get activeWindowId() {
    // TODO: better implementation
    const activeWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    return activeWindow.id
  }

  get activeTab(): Electron.WebContents | undefined {
    const tab = this.activeTabId ? this.getTabById(this.activeTabId) : undefined
    return tab && !tab.isDestroyed() ? tab : undefined
  }
  set activeTab(tab: Electron.WebContents | undefined) {
    const tabId = tab?.id
    if (this.activeTabId !== tabId) {
      this.activeTabId = tab?.id
      this.emit('active-tab-changed', tab)
    }
  }
  get activeWindow() {
    return this.activeWindowId ? BrowserWindow.fromId(this.activeWindowId) : undefined
  }

  tabDetailsCache = new Map<number, Partial<chrome.tabs.Tab>>()
  windowDetailsCache = new Map<number, Partial<chrome.windows.Window>>()

  constructor(
    private emitter: EventEmitter,
    public session: Electron.Session,
    public impl: ChromeExtensionImpl
  ) {}

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

  async createTab(event: Electron.IpcMainInvokeEvent, details: chrome.tabs.CreateProperties) {
    if (typeof this.impl.createTab !== 'function') {
      throw new Error('createTab not implemented')
    }

    const tab = await this.impl.createTab(event, details)
    return tab
  }
}
