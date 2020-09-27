import { ipcMain, BrowserWindow } from 'electron'
import { EventEmitter } from 'events'
import { ExtensionStore } from '../store'
import { getParentWindowOfTab, TabContents } from './common'
import { WindowsAPI } from './windows'

export class TabsAPI extends EventEmitter {
  static TAB_ID_NONE = -1
  static WINDOW_ID_NONE = -1
  static WINDOW_ID_CURRENT = -2

  private activeTabId?: number
  private activeWindowId?: number

  constructor(private store: ExtensionStore) {
    super()

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
    const win = getParentWindowOfTab(tab)
    const isMainFrame = win ? win.webContents === tab : false
    const [width = 0, height = 0] = win ? win.getSize() : []

    const details: chrome.tabs.Tab = {
      active: false,
      audible: tab.isCurrentlyAudible(),
      autoDiscardable: true,
      discarded: false,
      favIconUrl: tab.favicon || undefined,
      height,
      highlighted: false,
      id: tab.id,
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

    this.emit('create-tab-info', details, tab)

    if (details.active) {
      this.activeTabId = tab.id
      this.activeWindowId = getParentWindowOfTab(tab)?.id
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
    const tab = typeof this.activeTabId === 'number' && this.store.getTabById(this.activeTabId)
    return tab ? this.getTabDetails(tab) : undefined
  }

  private create(event: Electron.IpcMainInvokeEvent, details: chrome.tabs.CreateProperties = {}) {
    return new Promise<chrome.tabs.CreateProperties>((resolve, reject) => {
      this.emit('create-tab', event, details, (err: boolean | undefined, tabId: number) => {
        if (err) {
          reject()
        } else {
          const tab = this.store.getTabById(tabId)
          resolve(tab ? this.getTabDetails(tab) : {})
        }
      })
    })
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
            if (this.activeWindowId !== tab.windowId) return false
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
      tabId || this.activeTabId || Array.from(this.store.tabs)[0].id
    )
    if (!tab) return
    if (reloadProperties.bypassCache) {
      tab.reloadIgnoringCache()
    } else {
      tab.reload()
    }
  }

  private async update(event: Electron.IpcMainInvokeEvent, arg1?: unknown, arg2?: unknown) {
    const tabId = typeof arg1 === 'object' ? this.activeTabId || -1 : (arg1 as number)
    const updateProperties: chrome.tabs.UpdateProperties =
      (typeof arg1 === 'object' ? (arg1 as any) : (arg2 as any)) || {}

    const tab = this.store.getTabById(tabId)
    if (!tab) return

    const props = updateProperties

    // TODO: validate URL, prevent 'javascript:'
    if (props.url) await tab.loadURL(props.url)

    if (typeof props.muted === 'boolean') tab.setAudioMuted(props.muted)

    if (props.active) this.emit('select-tab', event, tabId)

    this.onUpdated(tabId)

    return this.createTabDetails(tab)
  }

  private remove(event: Electron.IpcMainInvokeEvent, id: number | number[]) {
    const ids = Array.isArray(id) ? id : [id]

    ids.forEach((tabId) => {
      this.emit('remove-tab', event, tabId)
      this.onRemoved(tabId)
    })
  }

  private goForward(event: Electron.IpcMainInvokeEvent, arg1?: unknown) {
    const tabId = typeof arg1 === 'number' ? (arg1 as number) : this.activeTabId || -1
    const tab = this.store.getTabById(tabId)
    if (!tab) return
    tab.goForward()
  }

  private goBack(event: Electron.IpcMainInvokeEvent, arg1?: unknown) {
    const tabId = typeof arg1 === 'number' ? (arg1 as number) : this.activeTabId || -1
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
    const tab = this.store.getTabById(tabId)
    if (!tab) return
    const win = getParentWindowOfTab(tab)

    let activeChanged = true

    // invalidate cache since 'active' has changed
    this.store.tabDetailsCache.forEach((tabInfo, cacheTabId) => {
      if (cacheTabId === tabId) activeChanged = !tabInfo.active
      tabInfo.active = tabId === cacheTabId
    })

    if (!activeChanged) return

    this.store.sendToHosts('tabs.onActivated', {
      tabId,
      windowId: win?.id,
    })
  }
}
