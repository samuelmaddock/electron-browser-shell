import { app, session as electronSession, webContents } from 'electron'
import { EventEmitter } from 'events'
import { BrowserActionAPI } from './api/browser-action'
import { TabsAPI } from './api/tabs'
import { WindowsAPI } from './api/windows'
import { WebNavigationAPI } from './api/web-navigation'
import { ExtensionStore } from './store'
import { TabContents } from './api/common'
import { ContextMenusAPI } from './api/context-menus'
import { RuntimeAPI } from './api/runtime'
import { ChromeExtensionImpl } from './impl'

export interface ChromeExtensionOptions extends ChromeExtensionImpl {
  session: Electron.Session
}

/**
 * Provides an implementation of various Chrome extension APIs to a session.
 */
export class Extensions extends EventEmitter {
  private store: ExtensionStore

  browserAction: BrowserActionAPI
  contextMenus: ContextMenusAPI
  runtime: RuntimeAPI
  tabs: TabsAPI
  webNavigation: WebNavigationAPI
  windows: WindowsAPI

  constructor(opts?: ChromeExtensionOptions) {
    super()

    const { session = electronSession.defaultSession, ...impl } = opts || {}

    this.store = new ExtensionStore(this, session, impl)

    this.browserAction = new BrowserActionAPI(this.store)
    this.contextMenus = new ContextMenusAPI(this.store)
    this.runtime = new RuntimeAPI(this.store)
    this.tabs = new TabsAPI(this.store)
    this.webNavigation = new WebNavigationAPI(this.store)
    this.windows = new WindowsAPI(this.store)

    app.on('web-contents-created', this.onWebContentsCreated)
  }

  private onWebContentsCreated = (event: Electron.Event, webContents: Electron.WebContents) => {
    if (webContents.session !== this.store.session) return

    if (webContents.getType() === 'backgroundPage') {
      this.addExtensionHost(webContents)
    }
  }

  /**
   * Add webContents to be tracked as a tab.
   */
  addTab(tab: Electron.WebContents) {
    if (this.store.tabs.has(tab)) return

    const tabId = tab.id
    this.store.tabs.add(tab)
    this.webNavigation.addTab(tab)

    if (typeof this.store.activeTabId === 'undefined') {
      this.store.activeTab = tab
    }

    const updateEvents = [
      'page-title-updated', // title
      'did-start-loading', // status
      'did-stop-loading', // status
      'media-started-playing', // audible
      'media-paused', // audible
      'did-start-navigation', // url
      'did-redirect-navigation', // url
      'did-navigate-in-page', // url
    ]

    const updateHandler = () => {
      this.tabs.onUpdated(tabId)
    }

    updateEvents.forEach((eventName) => {
      tab.on(eventName as any, updateHandler)
    })

    const faviconHandler = (event: Electron.Event, favicons: string[]) => {
      ;(tab as TabContents).favicon = favicons[0]
      this.tabs.onUpdated(tabId)
    }
    tab.on('page-favicon-updated', faviconHandler)

    tab.once('destroyed', () => {
      updateEvents.forEach((eventName) => {
        tab.off(eventName as any, updateHandler)
      })
      tab.off('page-favicon-updated', faviconHandler)

      this.store.tabs.delete(tab)
      this.tabs.onRemoved(tabId)
    })

    this.tabs.onCreated(tabId)
    this.tabs.onActivated(tabId)
    console.log(`Observing tab[${tabId}][${tab.getType()}] ${tab.getURL()}`)
  }

  selectTab(tab: Electron.WebContents) {
    if (this.store.tabs.has(tab)) {
      this.tabs.onActivated(tab.id)
    }
  }

  /**
   * Add webContents to be tracked as an extension host which will receive
   * extension events when a chrome-extension:// resource is loaded.
   *
   * This is usually reserved for extension background pages and popups, but
   * can also be used in other special cases.
   */
  addExtensionHost(host: Electron.WebContents) {
    if (this.store.extensionHosts.has(host)) return

    this.store.extensionHosts.add(host)

    host.once('destroyed', () => {
      this.store.extensionHosts.delete(host)
    })

    console.log(`Observing extension host[${host.id}][${host.getType()}] ${host.getURL()}`)
  }
}
