import { session as electronSession } from 'electron'
import { EventEmitter } from 'node:events'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

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
import { CommandsAPI } from './api/commands'
import { ExtensionContext } from './context'
import { ExtensionRouter } from './router'
import { checkLicense, License } from './license'
import { readLoadedExtensionManifest } from './manifest'
import { PermissionsAPI } from './api/permissions'
import { resolvePartition } from './partition'

function checkVersion() {
  const electronVersion = process.versions.electron
  if (electronVersion && parseInt(electronVersion.split('.')[0], 10) < 35) {
    console.warn('electron-chrome-extensions requires electron@>=35.0.0')
  }
}

function resolvePreloadPath(modulePath?: string) {
  // Attempt to resolve preload path from module exports
  try {
    return createRequire(__dirname).resolve('electron-chrome-extensions/preload')
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(error)
    }
  }

  const preloadFilename = 'chrome-extension-api.preload.js'

  // Deprecated: use modulePath if provided
  if (modulePath) {
    process.emitWarning(
      'electron-chrome-extensions: "modulePath" is deprecated and will be removed in future versions.',
      { type: 'DeprecationWarning' },
    )
    return path.join(modulePath, 'dist', preloadFilename)
  }

  // Fallback to preload relative to entrypoint directory
  return path.join(__dirname, preloadFilename)
}

export interface ChromeExtensionOptions extends ChromeExtensionImpl {
  /**
   * License used to distribute electron-chrome-extensions.
   *
   * See LICENSE.md for more details.
   */
  license: License

  /**
   * Session to add Chrome extension support in.
   * Defaults to `session.defaultSession`.
   */
  session?: Electron.Session

  /**
   * Path to electron-chrome-extensions module files. Might be needed if
   * JavaScript bundlers like Webpack are used in your build process.
   *
   * @deprecated See "Packaging the preload script" in the readme.
   */
  modulePath?: string
}

const sessionMap = new WeakMap<Electron.Session, ElectronChromeExtensions>()

/**
 * Provides an implementation of various Chrome extension APIs to a session.
 */
export class ElectronChromeExtensions extends EventEmitter {
  /** Retrieve an instance of this class associated with the given session. */
  static fromSession(session: Electron.Session) {
    return sessionMap.get(session)
  }

  /**
   * Handles the 'crx://' protocol in the session.
   *
   * This is required to display <browser-action-list> extension icons.
   */
  static handleCRXProtocol(session: Electron.Session) {
    if (session.protocol.isProtocolHandled('crx')) {
      session.protocol.unhandle('crx')
    }
    session.protocol.handle('crx', function handleCRXRequest(request) {
      let url
      try {
        url = new URL(request.url)
      } catch {
        return new Response('Invalid URL', { status: 404 })
      }

      const partition = url?.searchParams.get('partition') || '_self'
      const remoteSession = partition === '_self' ? session : resolvePartition(partition)
      const extensions = ElectronChromeExtensions.fromSession(remoteSession)
      if (!extensions) {
        return new Response(`ElectronChromeExtensions not found for "${partition}"`, {
          status: 404,
        })
      }

      return extensions.api.browserAction.handleCRXRequest(request)
    })
  }

  private ctx: ExtensionContext

  private api: {
    browserAction: BrowserActionAPI
    contextMenus: ContextMenusAPI
    commands: CommandsAPI
    cookies: CookiesAPI
    notifications: NotificationsAPI
    permissions: PermissionsAPI
    runtime: RuntimeAPI
    tabs: TabsAPI
    webNavigation: WebNavigationAPI
    windows: WindowsAPI
  }

  constructor(opts: ChromeExtensionOptions) {
    super()

    const { license, session = electronSession.defaultSession, ...impl } = opts || {}

    checkVersion()
    checkLicense(license)

    if (sessionMap.has(session)) {
      throw new Error(`Extensions instance already exists for the given session`)
    }

    sessionMap.set(session, this)

    const router = new ExtensionRouter(session)
    const store = new ExtensionStore(impl)

    this.ctx = {
      emit: this.emit.bind(this),
      router,
      session,
      store,
    }

    this.api = {
      browserAction: new BrowserActionAPI(this.ctx),
      contextMenus: new ContextMenusAPI(this.ctx),
      commands: new CommandsAPI(this.ctx),
      cookies: new CookiesAPI(this.ctx),
      notifications: new NotificationsAPI(this.ctx),
      permissions: new PermissionsAPI(this.ctx),
      runtime: new RuntimeAPI(this.ctx),
      tabs: new TabsAPI(this.ctx),
      webNavigation: new WebNavigationAPI(this.ctx),
      windows: new WindowsAPI(this.ctx),
    }

    this.listenForExtensions()
    this.prependPreload(opts.modulePath)
  }

  private listenForExtensions() {
    const sessionExtensions = this.ctx.session.extensions || this.ctx.session
    sessionExtensions.addListener('extension-loaded', (_event, extension) => {
      readLoadedExtensionManifest(this.ctx, extension)
    })
  }

  private async prependPreload(modulePath?: string) {
    const { session } = this.ctx

    const preloadPath = resolvePreloadPath(modulePath)

    if ('registerPreloadScript' in session) {
      session.registerPreloadScript({
        id: 'crx-mv2-preload',
        type: 'frame',
        filePath: preloadPath,
      })
      session.registerPreloadScript({
        id: 'crx-mv3-preload',
        type: 'service-worker',
        filePath: preloadPath,
      })
    } else {
      // @ts-expect-error Deprecated electron@<35
      session.setPreloads([...session.getPreloads(), preloadPath])
    }

    if (!existsSync(preloadPath)) {
      console.error(
        new Error(
          `electron-chrome-extensions: Preload file not found at "${preloadPath}". ` +
            'See "Packaging the preload script" in the readme.',
        ),
      )
    }
  }

  private checkWebContentsArgument(wc: Electron.WebContents) {
    if (this.ctx.session !== wc.session) {
      throw new TypeError(
        'Invalid WebContents argument. Its session must match the session provided to ElectronChromeExtensions constructor options.',
      )
    }
  }

  /** Add webContents to be tracked as a tab. */
  addTab(tab: Electron.WebContents, window: Electron.BaseWindow) {
    this.checkWebContentsArgument(tab)
    this.ctx.store.addTab(tab, window)
  }

  /** Remove webContents from being tracked as a tab. */
  removeTab(tab: Electron.WebContents) {
    this.checkWebContentsArgument(tab)
    this.ctx.store.removeTab(tab)
  }

  /** Notify extension system that the active tab has changed. */
  selectTab(tab: Electron.WebContents) {
    this.checkWebContentsArgument(tab)
    if (this.ctx.store.tabs.has(tab)) {
      this.api.tabs.onActivated(tab.id)
    }
  }

  /**
   * Add webContents to be tracked as an extension host which will receive
   * extension events when a chrome-extension:// resource is loaded.
   *
   * This is usually reserved for extension background pages and popups, but
   * can also be used in other special cases.
   *
   * @deprecated Extension hosts are now tracked lazily when they send
   * extension IPCs to the main process.
   */
  addExtensionHost(host: Electron.WebContents) {
    console.warn('ElectronChromeExtensions.addExtensionHost() is deprecated')
  }

  /**
   * Get collection of menu items managed by the `chrome.contextMenus` API.
   * @see https://developer.chrome.com/extensions/contextMenus
   */
  getContextMenuItems(webContents: Electron.WebContents, params: Electron.ContextMenuParams) {
    this.checkWebContentsArgument(webContents)
    return this.api.contextMenus.buildMenuItemsForParams(webContents, params)
  }

  /**
   * Gets map of special pages to extension override URLs.
   *
   * @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/chrome_url_overrides
   */
  getURLOverrides(): Record<string, string> {
    return this.ctx.store.urlOverrides
  }

  /**
   * Handles the 'crx://' protocol in the session.
   *
   * @deprecated Call `ElectronChromeExtensions.handleCRXProtocol(session)`
   * instead. The CRX protocol is no longer one-to-one with
   * ElectronChromeExtensions instances. Instead, it should now be handled only
   * on the sessions where <browser-action-list> extension icons will be shown.
   */
  handleCRXProtocol(session: Electron.Session) {
    throw new Error(
      'extensions.handleCRXProtocol(session) is deprecated, call ElectronChromeExtensions.handleCRXProtocol(session) instead.',
    )
  }

  /**
   * Add extensions to be visible as an extension action button.
   *
   * @deprecated Not needed in Electron >=12.
   */
  addExtension(extension: Electron.Extension) {
    console.warn('ElectronChromeExtensions.addExtension() is deprecated')
    this.api.browserAction.processExtension(extension)
  }

  /**
   * Remove extensions from the list of visible extension action buttons.
   *
   * @deprecated Not needed in Electron >=12.
   */
  removeExtension(extension: Electron.Extension) {
    console.warn('ElectronChromeExtensions.removeExtension() is deprecated')
    this.api.browserAction.removeActions(extension.id)
  }
}
