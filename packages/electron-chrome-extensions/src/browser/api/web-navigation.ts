import { ExtensionStore } from '../store'
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

const getFrameId = (frame: any) =>
  'webFrameMain' in electron ? (frame === frame.top ? 0 : frame.frameTreeNodeId) : -1

const getParentFrameId = (frame: any) => {
  if (frame && frame.parent) {
    return frame.parent === frame.top ? 0 : getFrameId(frame.parent)
  }
  return -1
}

const getFrameDetails = (frame: any) => ({
  errorOccurred: false, // TODO
  processId: frame.processId,
  frameId: getFrameId(frame),
  parentFrameId: getParentFrameId(frame),
  url: frame.url,
})

export class WebNavigationAPI {
  constructor(private store: ExtensionStore) {
    store.handle('webNavigation.getFrame', this.getFrame.bind(this))
    store.handle('webNavigation.getAllFrames', this.getAllFrames.bind(this))

    store.on('tab-added', this.observeTab.bind(this))
  }

  private observeTab(tab: Electron.WebContents) {
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
      if ('mainFrame' in tab) {
        const mainFrame = (tab as any).mainFrame
        targetFrame = mainFrame.framesInSubtree.find((frame: any) => {
          const isMainFrame = frame === frame.top
          return isMainFrame ? details.frameId === 0 : details.frameId === frame.frameTreeNodeId
        })
      }
    }

    return targetFrame ? getFrameDetails(targetFrame) : null
  }

  private getAllFrames(
    event: Electron.IpcMainInvokeEvent,
    details: chrome.webNavigation.GetFrameDetails
  ): chrome.webNavigation.GetAllFrameResultDetails[] | null {
    const tab = this.store.getTabById(details.tabId)
    if (!tab || !('mainFrame' in tab)) return []
    return (tab as any).mainFrame.framesInSubtree.map(getFrameDetails)
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
      sourceFrameId: getFrameId(frame),
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
      frameId: getFrameId(frame),
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
      frameId: getFrameId(frame),
      parentFrameId: getParentFrameId(frame),
      processId: frameProcessId,
      tabId: tab.id,
      timeStamp: Date.now(),
      url,
    }
    this.store.sendToHosts('webNavigation.onHistoryStateUpdated', details)
  }
}
