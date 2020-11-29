import { ExtensionStore } from '../store'
import { ipcMain } from 'electron'
import * as electron from 'electron'

type WebNavigationTransitionCallbackDetails = chrome.webNavigation.WebNavigationTransitionCallbackDetails & {
  parentFrameId: number
}

// https://github.com/electron/electron/pull/25464
const getFrame = (frameProcessId: number, frameRoutingId: number) => {
  return (
    ('webFrameMain' in electron &&
      (electron as any).webFrameMain.fromId(frameProcessId, frameRoutingId)) ||
    null
  )
}

const getParentFrameId = (frame: any) => {
  if (frame && frame.parent) {
    return frame.parent === frame.top ? 0 : frame.parent.frameTreeNodeId
  }
  return -1
}

const getFrameDetails = (frame: any) => ({
  errorOccurred: false, // TODO
  processId: frame.processId,
  frameId: frame.frameTreeNodeId,
  parentFrameId: getParentFrameId(frame),
  url: frame.url,
})

export class WebNavigationAPI {
  constructor(private store: ExtensionStore) {
    store.handle('webNavigation.getFrame', this.getFrame.bind(this))
    store.handle('webNavigation.getAllFrames', this.getAllFrames.bind(this))
  }

  addTab(tab: Electron.WebContents) {
    tab.on('did-frame-navigate', this.onCommitted as any)
    tab.on('did-navigate-in-page', this.onHistoryStateUpdated as any)
    tab.once('will-navigate', this.onCreatedNavigationTarget as any)
  }

  private getFrame(
    event: Electron.IpcMainInvokeEvent,
    details: chrome.webNavigation.GetFrameDetails
  ): chrome.webNavigation.GetFrameResultDetails | null {
    const tab = this.store.getTabById(details.tabId)
    if (!tab) return null

    let targetFrame: any

    if (typeof details.frameId === 'number') {
      // https://github.com/electron/electron/pull/25464
      if ('webFrame' in tab) {
        const mainFrame = (tab as any).webFrame
        targetFrame = mainFrame.framesInSubtree.find(
          (frame: any) => frame.frameTreeNodeId === details.frameId
        )
      }
    }

    return targetFrame ? getFrameDetails(targetFrame) : null
  }

  private getAllFrames(
    event: Electron.IpcMainInvokeEvent,
    details: chrome.webNavigation.GetFrameDetails
  ): chrome.webNavigation.GetAllFrameResultDetails[] | null {
    const tab = this.store.getTabById(details.tabId)
    if (!tab || !('webFrame' in tab)) return []
    return (tab as any).webFrame.framesInSubtree.map(getFrameDetails)
  }

  private onCreatedNavigationTarget = (
    event: Electron.IpcMainEvent,
    url: string,
    isInPlace: boolean,
    isMainFrame: boolean,
    frameProcessId: number,
    frameRoutingId: number
  ) => {
    const frame = getFrame(frameProcessId, frameRoutingId)
    const tab = event.sender
    const details: chrome.webNavigation.WebNavigationSourceCallbackDetails = {
      sourceTabId: tab.id,
      sourceProcessId: frameProcessId,
      sourceFrameId: frame ? frame.frameTreeNodeId : -1,
      url,
      tabId: tab.id,
      timeStamp: Date.now(),
    }
    this.store.sendToHosts('webNavigation.onCreatedNavigationTarget', details)
  }

  private onCommitted = (
    event: Electron.IpcMainEvent,
    url: string,
    httpResponseCode: number,
    httpStatusText: string,
    isMainFrame: boolean,
    frameProcessId: number,
    frameRoutingId: number
  ) => {
    const frame = getFrame(frameProcessId, frameRoutingId)
    const tab = event.sender
    const details: Partial<WebNavigationTransitionCallbackDetails> = {
      frameId: frame ? frame.frameTreeNodeId : -1,
      parentFrameId: getParentFrameId(frame),
      processId: frameProcessId,
      tabId: tab.id,
      timeStamp: Date.now(),
      url,
    }
    this.store.sendToHosts('webNavigation.onCommitted', details)
  }

  private onHistoryStateUpdated = (
    event: Electron.IpcMainEvent,
    url: string,
    isMainFrame: boolean,
    frameProcessId: number,
    frameRoutingId: number
  ) => {
    const frame = getFrame(frameProcessId, frameRoutingId)
    const tab = event.sender
    const details: Partial<WebNavigationTransitionCallbackDetails> = {
      // transitionType: '',
      // transitionQualifiers: [],
      frameId: frame ? frame.frameTreeNodeId : -1,
      parentFrameId: getParentFrameId(frame),
      processId: frameProcessId,
      tabId: tab.id,
      timeStamp: Date.now(),
      url,
    }
    this.store.sendToHosts('webNavigation.onHistoryStateUpdated', details)
  }
}
