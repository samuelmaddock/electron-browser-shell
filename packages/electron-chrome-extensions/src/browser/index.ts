import { BrowserView } from 'electron'
import { BrowserActionAPI } from './api/browser-action'
import { TabsAPI } from './api/tabs'
import { WindowsAPI } from './api/windows'
import { WebNavigationAPI } from './api/web-navigation'
import { ExtensionAPIState } from './api-state'
import { TabContents } from './api/common'
import { ContextMenusAPI } from './api/context-menus'

// TODO: support for non-default session

export class Extensions {
  state: ExtensionAPIState

  browserAction = new BrowserActionAPI()
  contextMenus = new ContextMenusAPI()
  tabs: TabsAPI
  webNavigation: WebNavigationAPI
  windows: WindowsAPI

  constructor(session: Electron.Session) {
    this.state = new ExtensionAPIState(session)

    this.tabs = new TabsAPI(this.state)
    this.webNavigation = new WebNavigationAPI(this.state)
    this.windows = new WindowsAPI(this.state)
  }

  observeTab(tab: Electron.WebContents) {
    const tabId = tab.id
    this.state.tabs.add(tab)
    this.webNavigation.addTab(tab)

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

      this.state.tabs.delete(tab)
      this.tabs.onRemoved(tabId)
    })

    this.tabs.onCreated(tabId)
    console.log(`Observing tab[${tabId}][${tab.getType()}] ${tab.getURL()}`)
  }

  observeExtensionHost(host: Electron.WebContents) {
    this.state.extensionHosts.add(host)

    host.once('destroyed', () => {
      this.state.extensionHosts.delete(host)
    })

    console.log(`Observing extension host[${host.id}][${host.getType()}] ${host.getURL()}`)
  }

  createPopup(win: Electron.BrowserWindow, tabId: string, extensionId: string) {
    const popupPath =
      this.browserAction.getPopupPath(win.webContents.session, extensionId, tabId) || `popup.html`
    const popupUrl = `chrome-extension://${extensionId}/${popupPath}`
    const popup = new BrowserView()
    popup.setBounds({ x: win.getSize()[0] - 256, y: 62, width: 256, height: 400 })
    // popup.webContents.loadURL(`chrome-extension://${extension.id}/popup.html?tabId=${win.webContents.id}`)
    console.log(`POPUP URL: ${popupUrl}`)
    popup.webContents.loadURL(popupUrl)
    popup.webContents.openDevTools({ mode: 'detach', activate: true })
    popup.setBackgroundColor('#ff0000')
    win.addBrowserView(popup)
    return popup
  }
}
