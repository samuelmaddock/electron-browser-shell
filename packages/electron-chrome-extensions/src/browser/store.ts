import { BrowserWindow, webContents } from 'electron'
import { EventEmitter } from 'events'
import { ChromeExtensionImpl } from './impl'
import { ExtensionEvent, ExtensionRouter, HandlerCallback, HandlerOptions } from './router'

const debug = require('debug')('electron-chrome-extensions:store')

export class ExtensionStore extends EventEmitter {
  private router = ExtensionRouter.get()

  /** Tabs observed by the extensions system. */
  tabs = new Set<Electron.WebContents>()

  /** Windows observed by the extensions system. */
  windows = new Set<Electron.BrowserWindow>()

  lastFocusedWindowId?: number

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
      if (host.isDestroyed()) {
        console.error(`Unable to send '${eventName}' to extension host`)
        return
      }
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
      throw new Error(`Unable to send '${eventName}' to extension host for ${extensionId}`)
    }
  }

  handle(name: string, callback: HandlerCallback, opts?: HandlerOptions) {
    this.router.handle(this.session, name, callback, opts)
  }

  getWindowById(windowId: number) {
    return Array.from(this.windows).find(
      (window) => !window.isDestroyed() && window.id === windowId
    )
  }

  getLastFocusedWindow() {
    return this.lastFocusedWindowId ? this.getWindowById(this.lastFocusedWindowId) : null
  }

  getCurrentWindow() {
    return this.getLastFocusedWindow()
  }

  addWindow(window: Electron.BrowserWindow) {
    if (this.windows.has(window)) return

    this.windows.add(window)

    if (typeof this.lastFocusedWindowId !== 'number') {
      this.lastFocusedWindowId = window.id
    }

    this.emit('window-added', window)
  }

  async createWindow(event: ExtensionEvent, details: chrome.windows.CreateData) {
    if (typeof this.impl.createWindow !== 'function') {
      throw new Error('createWindow is not implemented')
    }

    const win = await this.impl.createWindow(details)

    this.addWindow(win)

    return win
  }

  async removeWindow(window: Electron.BrowserWindow) {
    if (!this.windows.has(window)) return

    this.windows.delete(window)

    if (typeof this.impl.removeWindow === 'function') {
      await this.impl.removeWindow(window)
    } else {
      window.destroy()
    }
  }

  async newWindow(details: chrome.windows.CreateData) {
    if (typeof this.impl.newWindow !== 'function') {
      throw new Error('newWindow is not implemented')
    }

    const win = await this.impl.newWindow(details)

    this.addWindow(win)

    return win
  }

  getTabById(tabId: number) {
    return Array.from(this.tabs).find((tab) => !tab.isDestroyed() && tab.id === tabId)
  }

  addTab(tab: Electron.WebContents, window: Electron.BrowserWindow) {
    if (this.tabs.has(tab)) return

    this.tabs.add(tab)
    this.tabToWindow.set(tab, window)
    this.addWindow(window)

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

    if (typeof this.impl.removeTab === 'function') {
      this.impl.removeTab(tab, win)
    }
  }

  async createTab(details: chrome.tabs.CreateProperties) {
    if (typeof this.impl.createTab !== 'function') {
      throw new Error('createTab is not implemented')
    }

    // Fallback to current window
    if (!details.windowId) {
      details.windowId = this.lastFocusedWindowId
    }

    const result = await this.impl.createTab(details)

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

  getActiveTabFromWindow(win: Electron.BrowserWindow) {
    const activeTab = win && !win.isDestroyed() && this.windowToActiveTab.get(win)
    return (activeTab && !activeTab.isDestroyed() && activeTab) || undefined
  }

  getActiveTabFromWebContents(wc: Electron.WebContents): Electron.WebContents | undefined {
    const win = this.tabToWindow.get(wc) || BrowserWindow.fromWebContents(wc)
    return win ? this.getActiveTabFromWindow(win) : undefined
  }

  getActiveTabOfCurrentWindow() {
    const win = this.getCurrentWindow()
    return win ? this.getActiveTabFromWindow(win) : undefined
  }

  setActiveTab(tab: Electron.WebContents) {
    const win = this.tabToWindow.get(tab)
    if (!win) {
      throw new Error('Active tab has no parent window')
    }

    const prevActiveTab = this.getActiveTabFromWebContents(tab)

    this.windowToActiveTab.set(win, tab)

    if (tab.id !== prevActiveTab?.id) {
      this.emit('active-tab-changed', tab, win)
      this.emitPublic('active-tab-changed', tab, win)
    }
  }
}
