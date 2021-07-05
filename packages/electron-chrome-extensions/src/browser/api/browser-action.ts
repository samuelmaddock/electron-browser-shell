import { Menu, MenuItem } from 'electron'
import { ExtensionContext } from '../context'
import { PopupView } from '../popup'
import { ExtensionEvent } from '../router'
import { getIconImage, getExtensionUrl, getExtensionManifest } from './common'

const debug = require('debug')('electron-chrome-extensions:browserAction')

interface ExtensionAction {
  color?: string
  text?: string
  title?: string
  icon?:
    | string
    | {
        path: string
      }
  popup?: string
}

type ExtensionActionKey = keyof ExtensionAction

interface ActivateDetails {
  eventType: string
  extensionId: string
  tabId: number
  anchorRect: { x: number; y: number; width: number; height: number }
}

const getBrowserActionDefaults = (extension: Electron.Extension): ExtensionAction | undefined => {
  const manifest = getExtensionManifest(extension)
  const { browser_action } = manifest
  if (typeof browser_action === 'object') {
    const action: ExtensionAction = {}

    action.title = browser_action.default_title || manifest.name

    const iconImage = getIconImage(extension)
    if (iconImage) action.icon = iconImage.toDataURL()

    if (browser_action.default_popup) {
      action.popup = browser_action.default_popup
    }

    return action
  }
}

interface ExtensionActionStore extends Partial<ExtensionAction> {
  tabs: { [key: string]: ExtensionAction }
}

export class BrowserActionAPI {
  private actionMap = new Map</* extensionId */ string, ExtensionActionStore>()
  private popup?: PopupView

  private observers: Set<Electron.WebContents> = new Set()
  private queuedUpdate: boolean = false

  constructor(private ctx: ExtensionContext) {
    const handle = this.ctx.router.apiHandler()

    const getter =
      (propName: ExtensionActionKey) =>
      ({ extension }: ExtensionEvent, details: chrome.browserAction.TabDetails = {}) => {
        const { tabId } = details
        const action = this.getAction(extension.id)

        let result

        if (tabId) {
          if (action.tabs[tabId]) {
            result = action.tabs[tabId][propName]
          } else {
            result = action[propName]
          }
        } else {
          result = action[propName]
        }

        return result
      }

    const setter =
      (propName: ExtensionActionKey) =>
      ({ extension }: ExtensionEvent, details: chrome.browserAction.TabDetails) => {
        const { tabId } = details
        let value = (details as any)[propName] || undefined

        if (typeof value === 'undefined') {
          const defaults = getBrowserActionDefaults(extension)
          value = defaults ? defaults[propName] : value
        }

        const valueObj = { [propName]: value }
        const action = this.getAction(extension.id)

        if (tabId) {
          const tabAction = action.tabs[tabId] || (action.tabs[tabId] = {})
          Object.assign(tabAction, valueObj)
        } else {
          Object.assign(action, valueObj)
        }

        this.onUpdate()
      }

    const handleProp = (prop: string, key: ExtensionActionKey) => {
      handle(`browserAction.get${prop}`, getter(key))
      handle(`browserAction.set${prop}`, setter(key))
    }

    handleProp('BadgeBackgroundColor', 'color')
    handleProp('BadgeText', 'text')
    handleProp('Title', 'title')
    handleProp('Popup', 'popup')
    handle('browserAction.setIcon', setter('icon'))

    // browserAction preload API
    const preloadOpts = { allowRemote: true, extensionContext: false }
    handle('browserAction.getState', this.getState.bind(this), preloadOpts)
    handle('browserAction.activate', this.activate.bind(this), preloadOpts)
    handle(
      'browserAction.addObserver',
      (event) => {
        const { sender: webContents } = event
        this.observers.add(webContents)
        webContents.once('destroyed', () => {
          this.observers.delete(webContents)
        })
      },
      preloadOpts
    )
    handle(
      'browserAction.removeObserver',
      (event) => {
        const { sender: webContents } = event
        this.observers.delete(webContents)
      },
      preloadOpts
    )

    this.ctx.store.on('active-tab-changed', () => {
      this.onUpdate()
    })

    this.setupSession(this.ctx.session)
  }

  private setupSession(session: Electron.Session) {
    session.on('extension-loaded', (event, extension) => {
      this.processExtension(extension)
    })

    session.on('extension-unloaded', (event, extension) => {
      this.removeActions(extension.id)
    })
  }

  private getAction(extensionId: string) {
    let action = this.actionMap.get(extensionId)
    if (!action) {
      action = { tabs: {} }
      this.actionMap.set(extensionId, action)
      this.onUpdate()
    }

    return action
  }

  // TODO: Make private for v4 major release.
  removeActions(extensionId: string) {
    if (this.actionMap.has(extensionId)) {
      this.actionMap.delete(extensionId)
    }

    this.onUpdate()
  }

  private getPopupUrl(extensionId: string, tabId: number) {
    const action = this.getAction(extensionId)
    const popupPath = action.tabs[tabId]?.popup || action.popup || undefined
    return popupPath && `chrome-extension://${extensionId}/${popupPath}`
  }

  // TODO: Make private for v4 major release.
  processExtension(extension: Electron.Extension) {
    const defaultAction = getBrowserActionDefaults(extension)
    if (defaultAction) {
      const action = this.getAction(extension.id)
      Object.assign(action, defaultAction)
    }
  }

  private getState(event: ExtensionEvent) {
    const actions = Array.from(this.actionMap.entries()).map((val: any) => ({
      id: val[0],
      ...val[1],
    }))
    const activeTab = this.ctx.store.getActiveTabOfCurrentWindow()
    return { activeTabId: activeTab?.id, actions }
  }

  private activate({ sender }: ExtensionEvent, details: ActivateDetails) {
    const { eventType, extensionId, tabId } = details

    debug(
      `activate [eventType: ${eventType}, extensionId: '${extensionId}', tabId: ${tabId}, senderId: ${sender.id}]`
    )

    switch (eventType) {
      case 'click':
        this.activateClick(details)
        break
      case 'contextmenu':
        this.activateContextMenu(details)
        break
      default:
        console.debug(`Ignoring unknown browserAction.activate event '${eventType}'`)
    }
  }

  private activateClick(details: ActivateDetails) {
    const { extensionId, tabId, anchorRect } = details

    if (this.popup) {
      const toggleExtension = !this.popup.isDestroyed() && this.popup.extensionId === extensionId
      this.popup.destroy()
      this.popup = undefined
      if (toggleExtension) {
        debug('skipping activate to close popup')
        return
      }
    }

    const tab =
      tabId >= 0 ? this.ctx.store.getTabById(tabId) : this.ctx.store.getActiveTabOfCurrentWindow()
    if (!tab) {
      throw new Error(`Unable to get active tab`)
    }

    const popupUrl = this.getPopupUrl(extensionId, tab.id)

    if (popupUrl) {
      const win = this.ctx.store.tabToWindow.get(tab)
      if (!win) {
        throw new Error('Unable to get BrowserWindow from active tab')
      }

      this.popup = new PopupView({
        extensionId,
        session: this.ctx.session,
        parent: win,
        url: popupUrl,
        anchorRect,
      })

      debug(`opened popup: ${popupUrl}`)

      this.ctx.emit('browser-action-popup-created', this.popup)
    } else {
      debug(`dispatching onClicked for ${extensionId}`)

      const tabDetails = this.ctx.store.tabDetailsCache.get(tab.id)
      this.ctx.router.sendEvent(extensionId, 'browserAction.onClicked', tabDetails)
    }
  }

  private activateContextMenu(details: ActivateDetails) {
    const { extensionId, anchorRect } = details

    const extension = this.ctx.session.getExtension(extensionId)
    if (!extension) {
      throw new Error(`Unregistered extension '${extensionId}'`)
    }

    const manifest = getExtensionManifest(extension)
    const menu = new Menu()
    const append = (opts: Electron.MenuItemConstructorOptions) => menu.append(new MenuItem(opts))
    const appendSeparator = () => menu.append(new MenuItem({ type: 'separator' }))

    append({
      label: extension.name,
      click: () => {
        const homePageUrl =
          manifest.homepage_url || `https://chrome.google.com/webstore/detail/${extension.id}`
        this.ctx.store.createTab({ url: homePageUrl })
      },
    })

    appendSeparator()

    const contextMenuItems: MenuItem[] = this.ctx.store.buildMenuItems(
      extensionId,
      'browser_action'
    )
    if (contextMenuItems.length > 0) {
      contextMenuItems.forEach((item) => menu.append(item))
      appendSeparator()
    }

    const optionsPage = manifest.options_page || manifest.options_ui?.page
    const optionsPageUrl = optionsPage ? getExtensionUrl(extension, optionsPage) : undefined

    append({
      label: 'Options',
      enabled: typeof optionsPageUrl === 'string',
      click: () => {
        this.ctx.store.createTab({ url: optionsPageUrl })
      },
    })

    menu.popup({
      x: Math.floor(anchorRect.x),
      y: Math.floor(anchorRect.y + anchorRect.height),
    })
  }

  private onUpdate() {
    if (this.queuedUpdate) return
    this.queuedUpdate = true
    queueMicrotask(() => {
      this.queuedUpdate = false
      debug(`dispatching update to ${this.observers.size} observer(s)`)
      Array.from(this.observers).forEach((observer) => {
        if (!observer.isDestroyed()) {
          observer.send('browserAction.update')
        }
      })
    })
  }
}
