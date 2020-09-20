import { ExtensionAPIState } from '../api-state'
import { ipcMain } from 'electron'

type WebNavigationTransitionCallbackDetails = chrome.webNavigation.WebNavigationTransitionCallbackDetails & {
  parentFrameId: number
}

export class WebNavigationAPI {
  constructor(private state: ExtensionAPIState) {
    ipcMain.handle('webNavigation.getFrame', this.getFrame.bind(this))
  }

  addTab(tab: Electron.WebContents) {
    tab.on('did-start-navigation', this.onCommitted as any)
    tab.on('did-navigate-in-page', this.onHistoryStateUpdated as any)
    tab.once('will-navigate', this.onCreatedNavigationTarget as any)
  }

  private getFrame(
    event: Electron.IpcMainInvokeEvent,
    details: chrome.webNavigation.GetFrameDetails
  ): chrome.webNavigation.GetFrameResultDetails | null {
    const tab = this.state.getTabById(details.tabId)
    if (!tab) return null

    if (typeof details.processId === 'number' && tab.getProcessId() !== details.processId)
      return null

    // TODO: electron doesn't have a way to get the frame ID yet
    // if (typeof details.frameId === 'number' && tab.frameId !== details.frameId) return null

    return {
      url: tab.getURL(),
      parentFrameId: tab.hostWebContents ? tab.hostWebContents.id : -1, // TODO
      errorOccurred: false, // TODO
    }
  }

  private onCreatedNavigationTarget = (
    event: Electron.IpcMainEvent,
    url: string,
    isInPlace: boolean,
    isMainFrame: boolean,
    frameProcessId: number,
    frameRoutingId: number
  ) => {
    const tab = event.sender
    const details: chrome.webNavigation.WebNavigationSourceCallbackDetails = {
      sourceTabId: tab.id,
      sourceProcessId: frameProcessId,
      sourceFrameId: isMainFrame ? frameRoutingId : 0, // TODO: need to use frameTreeNodeId, not routingId
      url,
      tabId: tab.id,
      timeStamp: Date.now(),
    }
    this.state.sendToHosts('webNavigation.onCreatedNavigationTarget', details)
  }

  private onCommitted = (
    event: Electron.IpcMainEvent,
    url: string,
    isInPlace: boolean,
    isMainFrame: boolean,
    frameProcessId: number,
    frameRoutingId: number
  ) => {
    const tab = event.sender
    const details: Partial<WebNavigationTransitionCallbackDetails> = {
      frameId: isMainFrame ? frameRoutingId : 0, // TODO: need to use frameTreeNodeId, not routingId
      parentFrameId: tab.hostWebContents ? tab.hostWebContents.id : -1,
      processId: frameProcessId,
      tabId: tab.id,
      timeStamp: Date.now(),
      url,
    }
    this.state.sendToHosts('webNavigation.onCommitted', details)
  }

  private onHistoryStateUpdated = (
    event: Electron.IpcMainEvent,
    url: string,
    isMainFrame: boolean,
    frameProcessId: number,
    frameRoutingId: number
  ) => {
    const tab = event.sender
    const details: Partial<WebNavigationTransitionCallbackDetails> = {
      // transitionType: '',
      // transitionQualifiers: [],
      frameId: isMainFrame ? frameRoutingId : 0, // TODO: need to use frameTreeNodeId, not routingId
      parentFrameId: -1,
      processId: frameProcessId,
      tabId: tab.id,
      timeStamp: Date.now(),
      url,
    }
    this.state.sendToHosts('webNavigation.onHistoryStateUpdated', details)
  }
}
