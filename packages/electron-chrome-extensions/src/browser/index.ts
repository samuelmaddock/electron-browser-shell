import { app, session as electronSession } from 'electron'
import { EventEmitter } from 'events'
import path from 'path'

import { BrowserActionAPI } from './api/browser-action'
import { TabsAPI } from './api/tabs'
import { WindowsAPI } from './api/windows'
import { WebNavigationAPI } from './api/web-navigation'
import { ExtensionStore } from './store'
import { ContextMenusAPI } from './api/context-menus'
import { RuntimeAPI } from './api/runtime'
import { CookiesAPI } from './api/cookies'
import { NotificationsAPI } from './api/notifications'
import { ChromeExtensionImpl } from './impl'

const DEFAULT_PRELOAD_PATH = path.join(__dirname, 'preload.js')

export interface ChromeExtensionOptions extends ChromeExtensionImpl {
  session?: Electron.Session
}

/**
 * Provides an implementation of various Chrome extension APIs to a session.
 */
export class Extensions extends EventEmitter {
  private store: ExtensionStore

  private browserAction: BrowserActionAPI
  private contextMenus: ContextMenusAPI
  private cookies: CookiesAPI
  private notifications: NotificationsAPI
  private runtime: RuntimeAPI
  private tabs: TabsAPI
  private webNavigation: WebNavigationAPI
  private windows: WindowsAPI

  constructor(opts?: ChromeExtensionOptions) {
    super()

    const { session = electronSession.defaultSession, ...impl } = opts || {}

    this.store = new ExtensionStore(this, session, impl)

    this.browserAction = new BrowserActionAPI(this.store)
    this.contextMenus = new ContextMenusAPI(this.store)
    this.cookies = new CookiesAPI(this.store)
    this.notifications = new NotificationsAPI(this.store)
    this.runtime = new RuntimeAPI(this.store)
    this.tabs = new TabsAPI(this.store)
    this.webNavigation = new WebNavigationAPI(this.store)
    this.windows = new WindowsAPI(this.store)

    app.on('web-contents-created', this.onWebContentsCreated)

    this.prependPreload()
  }

  private prependPreload() {
    const { session } = this.store
    let preloads = session.getPreloads()

    const preloadPath = DEFAULT_PRELOAD_PATH

    const preloadIndex = preloads.indexOf(preloadPath)
    if (preloadIndex > -1) {
      preloads.splice(preloadIndex, 1)
    }

    preloads = [preloadPath, ...preloads]
    session.setPreloads(preloads)
  }

  private onWebContentsCreated = (event: Electron.Event, webContents: Electron.WebContents) => {
    if (webContents.session !== this.store.session) return

    if (webContents.getType() === 'backgroundPage') {
      this.addExtensionHost(webContents)
    }
  }

  /** Add webContents to be tracked as a tab. */
  addTab(tab: Electron.WebContents, window: Electron.BrowserWindow) {
    this.store.addTab(tab, window)
  }

  /** Notify extension system that the active tab has changed. */
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
    this.store.addExtensionHost(host)
  }

  /**
   * Get collection of menu items managed by the `chrome.contextMenus` API.
   * @see https://developer.chrome.com/extensions/contextMenus
   */
  getContextMenuItems(webContents: Electron.WebContents, params: Electron.ContextMenuParams) {
    return this.contextMenus.buildMenuItems(webContents, params)
  }

  /**
   * Add extensions to be visible as an extension action button.
   *
   * This is a temporary API which will go away soon after extension registry
   * events have been backported from Electron v12.
   */
  addExtension(extension: Electron.Extension) {
    this.browserAction.processExtension(this.store.session, extension)
  }
}
