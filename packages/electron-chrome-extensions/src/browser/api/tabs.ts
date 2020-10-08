import { ipcMain, BrowserWindow } from 'electron'
import { ExtensionStore } from '../store'
import { getParentWindowOfTab, TabContents } from './common'
import { WindowsAPI } from './windows'

export class TabsAPI {
  static TAB_ID_NONE = -1
  static WINDOW_ID_NONE = -1
  static WINDOW_ID_CURRENT = -2

  constructor(private store: ExtensionStore) {
    ipcMain.handle('tabs.get', this.get.bind(this))
    ipcMain.handle('tabs.getCurrent', this.getCurrent.bind(this))
    ipcMain.handle('tabs.create', this.create.bind(this))
    ipcMain.handle('tabs.insertCSS', this.insertCSS.bind(this))
    ipcMain.handle('tabs.query', this.query.bind(this))
    ipcMain.handle('tabs.reload', this.reload.bind(this))
    ipcMain.handle('tabs.update', this.update.bind(this))
    ipcMain.handle('tabs.remove', this.remove.bind(this))
    ipcMain.handle('tabs.goForward', this.goForward.bind(this))
    ipcMain.handle('tabs.goBack', this.goBack.bind(this))
  }

  private createTabDetails(tab: TabContents) {
    const tabId = tab.id
    const win = getParentWindowOfTab(tab)
    const [width = 0, height = 0] = win ? win.getSize() : []

    const details: chrome.tabs.Tab = {
      active: this.store.activeTabId === tabId,
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
      url: tab.getURL(),
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

  private get(event: Electron.IpcMainInvokeEvent, tabId: number) {
    const tab = this.store.getTabById(tabId)
    if (!tab) return { id: TabsAPI.TAB_ID_NONE }
    return this.getTabDetails(tab)
  }

  private getCurrent(event: Electron.IpcMainInvokeEvent) {
    const tab = this.store.activeTab
    return tab ? this.getTabDetails(tab) : undefined
  }

  private async create(
    event: Electron.IpcMainInvokeEvent,
    details: chrome.tabs.CreateProperties = {}
  ) {
    const tab = await this.store.createTab(event, details)
    const tabDetails = this.getTabDetails(tab)
    if (details.active) {
      queueMicrotask(() => this.onActivated(tab.id))
    }
    return tabDetails
  }

  private insertCSS(
    event: Electron.IpcMainInvokeEvent,
    tabId: number,
    details: chrome.tabs.InjectDetails
  ) {
    const tab = this.store.getTabById(tabId)
    if (!tab) return

    // TODO: move to webFrame in renderer?
    if (details.code) {
      tab.insertCSS(details.code)
    }
  }

  private query(event: Electron.IpcMainInvokeEvent, info: chrome.tabs.QueryInfo = {}) {
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
            if (this.store.activeWindowId !== tab.windowId) return false
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

  private reload(
    event: Electron.IpcMainInvokeEvent,
    tabId?: number,
    reloadProperties: chrome.tabs.ReloadProperties = {}
  ) {
    const tab = this.store.getTabById(
      tabId || this.store.activeTabId || Array.from(this.store.tabs)[0].id
    )
    if (!tab) return
    if (reloadProperties.bypassCache) {
      tab.reloadIgnoringCache()
    } else {
      tab.reload()
    }
  }

  private async update(event: Electron.IpcMainInvokeEvent, arg1?: unknown, arg2?: unknown) {
    const tabId = typeof arg1 === 'object' ? this.store.activeTabId || -1 : (arg1 as number)
    const updateProperties: chrome.tabs.UpdateProperties =
      (typeof arg1 === 'object' ? (arg1 as any) : (arg2 as any)) || {}

    const tab = this.store.getTabById(tabId)
    if (!tab) return

    const props = updateProperties

    // TODO: validate URL, prevent 'javascript:'
    if (props.url) await tab.loadURL(props.url)

    if (typeof props.muted === 'boolean') tab.setAudioMuted(props.muted)

    if (props.active) this.onActivated(tabId)

    this.onUpdated(tabId)

    return this.createTabDetails(tab)
  }

  private remove(event: Electron.IpcMainInvokeEvent, id: number | number[]) {
    const ids = Array.isArray(id) ? id : [id]
    const hasRemoveTab = typeof this.store.impl.removeTab === 'function'

    ids.forEach((tabId) => {
      if (hasRemoveTab) {
        const tab = this.store.getTabById(tabId)
        if (tab) this.store.impl.removeTab!(event, tab)
      }
      this.onRemoved(tabId)
    })
  }

  private goForward(event: Electron.IpcMainInvokeEvent, arg1?: unknown) {
    const tabId = typeof arg1 === 'number' ? (arg1 as number) : this.store.activeTabId || -1
    const tab = this.store.getTabById(tabId)
    if (!tab) return
    tab.goForward()
  }

  private goBack(event: Electron.IpcMainInvokeEvent, arg1?: unknown) {
    const tabId = typeof arg1 === 'number' ? (arg1 as number) : this.store.activeTabId || -1
    const tab = this.store.getTabById(tabId)
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
    const activeChanged = this.store.activeTabId !== tabId
    if (!activeChanged) return

    const tab = this.store.getTabById(tabId)
    if (!tab) return
    const win = getParentWindowOfTab(tab)

    this.store.activeTab = tab

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
