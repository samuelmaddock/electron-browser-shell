import { ipcMain, BrowserWindow } from 'electron'
import { EventEmitter } from 'events'
import { ExtensionAPIState } from '../api-state'
import { getParentWindowOfTab, TabContents } from './common'
import { WindowsAPI } from './windows'

export class TabsAPI extends EventEmitter {
  static TAB_ID_NONE = -1

  private activeTabId?: number

  constructor(private state: ExtensionAPIState) {
    super()

    ipcMain.handle('tabs.get', this.get.bind(this))
    ipcMain.handle('tabs.getAllInWindow', this.getAllInWindow.bind(this))
    ipcMain.handle('tabs.create', this.create.bind(this))
    ipcMain.handle('tabs.insertCSS', this.insertCSS.bind(this))
    ipcMain.handle('tabs.query', this.query.bind(this))
    ipcMain.handle('tabs.reload', this.reload.bind(this))
    ipcMain.handle('tabs.update', this.update.bind(this))
    ipcMain.handle('tabs.remove', this.remove.bind(this))
  }

  private createTabDetails(tab: TabContents) {
    const win = getParentWindowOfTab(tab)
    const isMainFrame = win ? win.webContents === tab : false
    const [width = 0, height = 0] = win ? win.getSize() : []

    const details: Partial<chrome.tabs.Tab> = {
      active: false,
      audible: tab.isCurrentlyAudible(),
      autoDiscardable: true,
      discarded: false,
      favIconUrl: tab.favicon || undefined,
      height,
      highlighted: false,
      id: tab.id,
      incognito: false,
      // index: 0,
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
    }

    this.state.tabDetailsCache.set(tab.id, details)
    return details
  }

  private getTabDetails(tab: TabContents) {
    if (this.state.tabDetailsCache.has(tab.id)) {
      return this.state.tabDetailsCache.get(tab.id)
    }
    const details = this.createTabDetails(tab)
    return details
  }

  private get(event: Electron.IpcMainInvokeEvent, tabId: number) {
    const tab = this.state.getTabById(tabId)
    if (!tab) return { id: TabsAPI.TAB_ID_NONE }
    return this.getTabDetails(tab)
  }

  private getAllInWindow(event: Electron.IpcMainInvokeEvent, windowId?: number) {
    const targetWindowId = windowId || getParentWindowOfTab(event.sender)?.id

    const tabsInWindow = Array.from(this.state.tabs)
      .filter((tab) => {
        const tabWindow = getParentWindowOfTab(tab)
        return tabWindow ? targetWindowId === tabWindow.id : false
      })
      .map((tab) => this.getTabDetails(tab))

    return tabsInWindow
  }

  private create(event: Electron.IpcMainInvokeEvent, details: chrome.tabs.CreateProperties = {}) {
    return new Promise<chrome.tabs.CreateProperties>((resolve, reject) => {
      this.emit('create-tab', event, details, (err: boolean | undefined, tabId: number) => {
        if (err) {
          reject()
        } else {
          const tab = this.state.getTabById(tabId)
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
    const tab = this.state.getTabById(tabId)
    if (!tab) return

    // TODO: move to webFrame in renderer?
    if (details.code) {
      tab.insertCSS(details.code)
    }
  }

  private query(event: Electron.IpcMainInvokeEvent, info: chrome.tabs.QueryInfo = {}) {
    const isSet = (value: any) => typeof value !== 'undefined'

    const filteredTabs = Array.from(this.state.tabs)
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
        if (isSet(info.windowId) && info.windowId !== tab.windowId) return false
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
    const tab = this.state.getTabById(
      tabId || this.activeTabId || Array.from(this.state.tabs)[0].id
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

    const tab = this.state.getTabById(tabId)
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

  onCreated(tabId: number) {
    const tab = this.state.getTabById(tabId)
    if (!tab) return
    const tabDetails = this.getTabDetails(tab)
    this.state.sendToHosts('tabs.onCreated', tabDetails)
  }

  onUpdated(tabId: number) {
    const tab = this.state.getTabById(tabId)
    if (!tab) return

    let prevDetails
    if (this.state.tabDetailsCache.has(tab.id)) {
      prevDetails = this.state.tabDetailsCache.get(tab.id)
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

    this.state.sendToHosts('tabs.onUpdated', tab.id, changeInfo, details)
  }

  onRemoved(tabId: number) {
    const details = this.state.tabDetailsCache.has(tabId)
      ? this.state.tabDetailsCache.get(tabId)
      : null
    this.state.tabDetailsCache.delete(tabId)

    const windowId = details ? details.windowId : WindowsAPI.WINDOW_ID_NONE
    const win =
      typeof windowId !== 'undefined' && windowId > -1
        ? BrowserWindow.getAllWindows().find((win) => win.id === windowId)
        : null

    this.state.sendToHosts('tabs.onRemoved', tabId, {
      windowId,
      isWindowClosing: win ? win.isDestroyed() : false,
    })
  }

  onActivated(tabId: number) {
    const tab = this.state.getTabById(tabId)
    if (!tab) return
    const win = getParentWindowOfTab(tab)

    let activeChanged = true

    // invalidate cache since 'active' has changed
    this.state.tabDetailsCache.forEach((tabInfo, cacheTabId) => {
      if (cacheTabId === tabId) activeChanged = !tabInfo.active
      tabInfo.active = tabId === cacheTabId
    })

    if (!activeChanged) return

    this.state.sendToHosts('tabs.onActivated', {
      tabId,
      windowId: win?.id,
    })
  }
}
