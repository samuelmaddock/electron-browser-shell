import { BrowserWindow, webContents } from 'electron'
import { EventEmitter } from 'events'
import { ChromeExtensionImpl } from './impl'
import { ExtensionRouter, Handler } from './router'

const debug = require('debug')('electron-chrome-extensions:store')

export class ExtensionStore extends EventEmitter {
  private router = ExtensionRouter.get()

  /** Tabs observed by the extensions system. */
  tabs = new Set<Electron.WebContents>()

  /** Windows observed by the extensions system. */
  windows = new Set<Electron.BrowserWindow>()

  /**
   * Map of tabs to their parent window.
   *
   * It's not possible to access the parent of a BrowserView so we must manage
   * this ourselves.
   */
  tabToWindow = new WeakMap<Electron.WebContents, Electron.BrowserWindow>()

  extensionHosts = new Set<Electron.WebContents>()

  /** Map of windows to their active tab. */
  private windowToActiveTab = new WeakMap<Electron.BrowserWindow, Electron.WebContents>()

  get activeWindowId() {
    // TODO: better implementation
    const activeWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    return activeWindow.id
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
  ) {
    super()
  }

  /** Emit an event to the public API. */
  emitPublic(eventName: string, ...args: any[]) {
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

  handle(name: string, callback: Handler) {
    this.router.handle(this.session, name, callback)
  }

  getTabById(tabId: number) {
    return Array.from(this.tabs).find((tab) => !tab.isDestroyed() && tab.id === tabId)
  }

  addTab(tab: Electron.WebContents, window: Electron.BrowserWindow) {
    if (this.tabs.has(tab)) return

    this.tabs.add(tab)
    this.tabToWindow.set(tab, window)
    this.windows.add(window)

    const activeTab = this.getActiveTabFromWebContents(tab)
    if (!activeTab) {
      this.setActiveTab(tab)
    }

    this.emit('tab-added', tab)
  }

  removeTab(tab: Electron.WebContents) {
    if (!this.tabs.has(tab)) return

    const win = this.tabToWindow.get(tab)!

    this.tabs.delete(tab)
    this.tabToWindow.delete(tab)

    // TODO: clear active tab

    // Clear window if it has no remaining tabs
    const windowHasTabs = Array.from(this.tabs).find((tab) => this.tabToWindow.get(tab) === win)
    if (!windowHasTabs) {
      this.windows.delete(win)
    }
  }

  async createTab(event: Electron.IpcMainInvokeEvent, details: chrome.tabs.CreateProperties) {
    if (typeof this.impl.createTab !== 'function') {
      throw new Error('createTab not implemented')
    }

    const result = await this.impl.createTab(event, details)

    if (!Array.isArray(result)) {
      throw new Error('createTab must return an array of [tab, window]')
    }

    const [tab, window] = result

    if (typeof tab !== 'object' || !webContents.fromId(tab.id)) {
      throw new Error('createTab must return a WebContents')
    } else if (typeof window !== 'object') {
      throw new Error('createTab must return a BrowserWindow')
    }

    this.addTab(tab, window)

    return tab
  }

  addExtensionHost(host: Electron.WebContents) {
    if (this.extensionHosts.has(host)) return

    this.extensionHosts.add(host)

    host.once('destroyed', () => {
      this.extensionHosts.delete(host)
    })

    debug(`Observing extension host[${host.id}][${host.getType()}] ${host.getURL()}`)
  }

  getActiveTabFromWebContents(wc: Electron.WebContents): Electron.WebContents | undefined {
    const win = this.tabToWindow.get(wc) || BrowserWindow.fromWebContents(wc)
    const activeTab = win && !win.isDestroyed() && this.windowToActiveTab.get(win)
    return (activeTab && !activeTab.isDestroyed() && activeTab) || undefined
  }

  setActiveTab(tab: Electron.WebContents) {
    const win = this.tabToWindow.get(tab)
    if (!win) {
      throw new Error('Active tab has no parent window')
    }

    const prevActiveTab = this.getActiveTabFromWebContents(tab)

    this.windowToActiveTab.set(win, tab)

    if (tab.id !== prevActiveTab?.id) {
      this.emitPublic('active-tab-changed', tab)
    }
  }
}
