import { BrowserWindow } from 'electron'
import { ExtensionEvent } from '../router'
import { ExtensionStore } from '../store'
import { TabContents } from './common'
import { WindowsAPI } from './windows'

const debug = require('debug')('electron-chrome-extensions:tabs')

export class TabsAPI {
  static TAB_ID_NONE = -1
  static WINDOW_ID_NONE = -1
  static WINDOW_ID_CURRENT = -2

  constructor(private store: ExtensionStore) {
    store.handle('tabs.get', this.get.bind(this))
    store.handle('tabs.getAllInWindow', this.getAllInWindow.bind(this))
    store.handle('tabs.getCurrent', this.getCurrent.bind(this))
    store.handle('tabs.create', this.create.bind(this))
    store.handle('tabs.insertCSS', this.insertCSS.bind(this))
    store.handle('tabs.query', this.query.bind(this))
    store.handle('tabs.reload', this.reload.bind(this))
    store.handle('tabs.update', this.update.bind(this))
    store.handle('tabs.remove', this.remove.bind(this))
    store.handle('tabs.goForward', this.goForward.bind(this))
    store.handle('tabs.goBack', this.goBack.bind(this))

    store.on('tab-added', this.observeTab.bind(this))
  }

  private observeTab(tab: TabContents) {
    const tabId = tab.id

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
      this.onUpdated(tabId)
    }

    updateEvents.forEach((eventName) => {
      tab.on(eventName as any, updateHandler)
    })

    const faviconHandler = (event: Electron.Event, favicons: string[]) => {
      ;(tab as TabContents).favicon = favicons[0]
      this.onUpdated(tabId)
    }
    tab.on('page-favicon-updated', faviconHandler)

    tab.once('destroyed', () => {
      updateEvents.forEach((eventName) => {
        tab.off(eventName as any, updateHandler)
      })
      tab.off('page-favicon-updated', faviconHandler)

      this.store.removeTab(tab)
      this.onRemoved(tabId)
    })

    this.onCreated(tabId)
    this.onActivated(tabId)

    debug(`Observing tab[${tabId}][${tab.getType()}] ${tab.getURL()}`)
  }

  private createTabDetails(tab: TabContents) {
    const tabId = tab.id
    const activeTab = this.store.getActiveTabFromWebContents(tab)
    const win = this.store.tabToWindow.get(tab)
    const [width = 0, height = 0] = win ? win.getSize() : []

    const details: chrome.tabs.Tab = {
      active: activeTab?.id === tabId,
      audible: tab.isCurrentlyAudible(),
      autoDiscardable: true,
      discarded: false,
      favIconUrl: tab.favicon || undefined,
      height,
      highlighted: false,
      id: tabId,
      incognito: false,
      index: -1, // TODO
      mutedInfo: { muted: tab.audioMuted },
      pinned: false,
      selected: true,
      status: tab.isLoading() ? 'loading' : 'complete',
      title: tab.getTitle(),
      url: tab.getURL(), // TODO: tab.mainFrame.url (Electron 12)
      width,
      windowId: win ? win.id : -1,
    }

    if (typeof this.store.impl.assignTabDetails === 'function') {
      this.store.impl.assignTabDetails(details, tab)
    }

    this.store.tabDetailsCache.set(tab.id, details)
    return details
  }

  private getTabDetails(tab: TabContents) {
    if (this.store.tabDetailsCache.has(tab.id)) {
      return this.store.tabDetailsCache.get(tab.id)
    }
    const details = this.createTabDetails(tab)
    return details
  }

  private get(event: ExtensionEvent, tabId: number) {
    const tab = this.store.getTabById(tabId)
    if (!tab) return { id: TabsAPI.TAB_ID_NONE }
    return this.getTabDetails(tab)
  }

  private getAllInWindow(event: ExtensionEvent, windowId: number = TabsAPI.WINDOW_ID_CURRENT) {
    if (windowId === TabsAPI.WINDOW_ID_CURRENT) windowId = this.store.lastFocusedWindowId!

    const tabs = Array.from(this.store.tabs).filter((tab) => {
      if (tab.isDestroyed()) return false

      const browserWindow = this.store.tabToWindow.get(tab)
      if (!browserWindow || browserWindow.isDestroyed()) return

      return browserWindow.id === windowId
    })

    return tabs.map(this.getTabDetails.bind(this))
  }

  private getCurrent(event: ExtensionEvent) {
    const tab = this.store.getActiveTabFromWebContents(event.sender)
    return tab ? this.getTabDetails(tab) : undefined
  }

  private async create(event: ExtensionEvent, details: chrome.tabs.CreateProperties = {}) {
    const tab = await this.store.createTab(details)
    const tabDetails = this.getTabDetails(tab)
    if (details.active) {
      queueMicrotask(() => this.onActivated(tab.id))
    }
    return tabDetails
  }

  private insertCSS(event: ExtensionEvent, tabId: number, details: chrome.tabs.InjectDetails) {
    const tab = this.store.getTabById(tabId)
    if (!tab) return

    // TODO: move to webFrame in renderer?
    if (details.code) {
      tab.insertCSS(details.code)
    }
  }

  private query(event: ExtensionEvent, info: chrome.tabs.QueryInfo = {}) {
    const isSet = (value: any) => typeof value !== 'undefined'

    const filteredTabs = Array.from(this.store.tabs)
      .map(this.getTabDetails.bind(this))
      .filter((tab) => {
        if (!tab) return false
        if (isSet(info.active) && info.active !== tab.active) return false
        if (isSet(info.pinned) && info.pinned !== tab.pinned) return false
        if (isSet(info.audible) && info.audible !== tab.audible) return false
        if (isSet(info.muted) && info.muted !== tab.mutedInfo?.muted) return false
        if (isSet(info.highlighted) && info.highlighted !== tab.highlighted) return false
        if (isSet(info.discarded) && info.discarded !== tab.discarded) return false
        if (isSet(info.autoDiscardable) && info.autoDiscardable !== tab.autoDiscardable)
          return false
        // if (isSet(info.currentWindow)) return false
        // if (isSet(info.lastFocusedWindow)) return false
        if (isSet(info.status) && info.status !== tab.status) return false
        if (isSet(info.title) && info.title !== tab.title) return false // TODO: pattern match
        if (isSet(info.url) && info.url !== tab.url) return false // TODO: match URL pattern
        if (isSet(info.windowId)) {
          if (info.windowId === TabsAPI.WINDOW_ID_CURRENT) {
            if (this.store.lastFocusedWindowId !== tab.windowId) return false
          } else if (info.windowId !== tab.windowId) {
            return false
          }
        }
        // if (isSet(info.windowType) && info.windowType !== tab.windowType) return false
        // if (isSet(info.index) && info.index !== tab.index) return false
        return true
      })
      .map((tab, index) => {
        if (tab) {
          tab.index = index
        }
        return tab
      })
    return filteredTabs
  }

  private reload(event: ExtensionEvent, arg1?: unknown, arg2?: unknown) {
    const tabId: number | undefined = typeof arg1 === 'number' ? arg1 : undefined
    const reloadProperties: chrome.tabs.ReloadProperties | null =
      typeof arg1 === 'object' ? arg1 : typeof arg2 === 'object' ? arg2 : {}

    const tab = tabId
      ? this.store.getTabById(tabId)
      : this.store.getActiveTabFromWebContents(event.sender)

    if (!tab) return

    if (reloadProperties?.bypassCache) {
      tab.reloadIgnoringCache()
    } else {
      tab.reload()
    }
  }

  private async update(event: ExtensionEvent, arg1?: unknown, arg2?: unknown) {
    let tabId = typeof arg1 === 'number' ? arg1 : undefined
    const updateProperties: chrome.tabs.UpdateProperties =
      (typeof arg1 === 'object' ? (arg1 as any) : (arg2 as any)) || {}

    const tab = tabId
      ? this.store.getTabById(tabId)
      : this.store.getActiveTabFromWebContents(event.sender)
    if (!tab) return

    tabId = tab.id

    const props = updateProperties

    // TODO: validate URL, prevent 'javascript:'
    if (props.url) await tab.loadURL(props.url)

    if (typeof props.muted === 'boolean') tab.setAudioMuted(props.muted)

    if (props.active) this.onActivated(tabId)

    this.onUpdated(tabId)

    return this.createTabDetails(tab)
  }

  private remove(event: ExtensionEvent, id: number | number[]) {
    const ids = Array.isArray(id) ? id : [id]

    ids.forEach((tabId) => {
      const tab = this.store.getTabById(tabId)
      if (tab) this.store.removeTab(tab)
      this.onRemoved(tabId)
    })
  }

  private goForward(event: ExtensionEvent, arg1?: unknown) {
    const tabId = typeof arg1 === 'number' ? arg1 : undefined
    const tab = tabId
      ? this.store.getTabById(tabId)
      : this.store.getActiveTabFromWebContents(event.sender)
    if (!tab) return
    tab.goForward()
  }

  private goBack(event: ExtensionEvent, arg1?: unknown) {
    const tabId = typeof arg1 === 'number' ? arg1 : undefined
    const tab = tabId
      ? this.store.getTabById(tabId)
      : this.store.getActiveTabFromWebContents(event.sender)
    if (!tab) return
    tab.goBack()
  }

  onCreated(tabId: number) {
    const tab = this.store.getTabById(tabId)
    if (!tab) return
    const tabDetails = this.getTabDetails(tab)
    this.store.sendToHosts('tabs.onCreated', tabDetails)
  }

  onUpdated(tabId: number) {
    const tab = this.store.getTabById(tabId)
    if (!tab) return

    let prevDetails
    if (this.store.tabDetailsCache.has(tab.id)) {
      prevDetails = this.store.tabDetailsCache.get(tab.id)
    }
    if (!prevDetails) return

    const details = this.createTabDetails(tab)

    const compareProps: (keyof chrome.tabs.Tab)[] = [
      'status',
      'url',
      'pinned',
      'audible',
      'discarded',
      'autoDiscardable',
      'mutedInfo',
      'favIconUrl',
      'title',
    ]

    let didUpdate = false
    const changeInfo: chrome.tabs.TabChangeInfo = {}

    for (const prop of compareProps) {
      if (details[prop] !== prevDetails[prop]) {
        ;(changeInfo as any)[prop] = details[prop]
        didUpdate = true
      }
    }

    if (!didUpdate) return

    this.store.sendToHosts('tabs.onUpdated', tab.id, changeInfo, details)
  }

  onRemoved(tabId: number) {
    const details = this.store.tabDetailsCache.has(tabId)
      ? this.store.tabDetailsCache.get(tabId)
      : null
    this.store.tabDetailsCache.delete(tabId)

    const windowId = details ? details.windowId : WindowsAPI.WINDOW_ID_NONE
    const win =
      typeof windowId !== 'undefined' && windowId > -1
        ? BrowserWindow.getAllWindows().find((win) => win.id === windowId)
        : null

    this.store.sendToHosts('tabs.onRemoved', tabId, {
      windowId,
      isWindowClosing: win ? win.isDestroyed() : false,
    })
  }

  onActivated(tabId: number) {
    const tab = this.store.getTabById(tabId)
    if (!tab) return

    const activeTab = this.store.getActiveTabFromWebContents(tab)
    const activeChanged = activeTab?.id !== tabId
    if (!activeChanged) {
      this.store.setActiveTab(tab)
    }

    const win = this.store.tabToWindow.get(tab)

    // invalidate cache since 'active' has changed
    this.store.tabDetailsCache.forEach((tabInfo, cacheTabId) => {
      tabInfo.active = tabId === cacheTabId
    })

    this.store.sendToHosts('tabs.onActivated', {
      tabId,
      windowId: win?.id,
    })
  }
}
