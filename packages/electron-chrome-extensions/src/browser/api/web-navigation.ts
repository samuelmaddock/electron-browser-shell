import * as electron from 'electron'
import { WebFrameMain } from 'electron'
import { ExtensionEvent } from '../router'
import { ExtensionStore } from '../store'

const debug = require('debug')('electron-chrome-extensions:webNavigation')

// https://github.com/electron/electron/pull/25464
const getFrame = (frameProcessId: number, frameRoutingId: number): WebFrameMain | undefined => {
  return (
    ('webFrameMain' in electron && electron.webFrameMain.fromId(frameProcessId, frameRoutingId)) ||
    undefined
  )
}

const getFrameId = (frame?: WebFrameMain) =>
  'webFrameMain' in electron && frame ? (frame === frame.top ? 0 : frame.frameTreeNodeId) : -1

const getParentFrameId = (frame?: WebFrameMain) => {
  const parentFrame = frame?.parent
  return parentFrame ? getFrameId(parentFrame) : -1
}

const getFrameDetails = (frame?: WebFrameMain) => ({
  errorOccurred: false, // TODO
  processId: frame?.processId,
  frameId: getFrameId(frame),
  parentFrameId: getParentFrameId(frame),
  url: frame?.url,
})

export class WebNavigationAPI {
  constructor(private store: ExtensionStore) {
    store.handle('webNavigation.getFrame', this.getFrame.bind(this))
    store.handle('webNavigation.getAllFrames', this.getAllFrames.bind(this))

    store.on('tab-added', this.observeTab.bind(this))
  }

  private observeTab(tab: Electron.WebContents) {
    tab.once('will-navigate', this.onCreatedNavigationTarget as any)
    tab.on('did-start-navigation', this.onBeforeNavigate as any)
    tab.on('did-frame-finish-load', this.onFinishLoad as any)
    tab.on('did-frame-navigate', this.onCommitted as any)
    tab.on('did-navigate-in-page', this.onHistoryStateUpdated as any)
    tab.on('dom-ready', this.onDOMContentLoaded as any)
    tab.on('frame-dom-ready' as any, this.onDOMContentLoaded)
  }

  private getFrame(
    event: ExtensionEvent,
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

    return (targetFrame && getFrameDetails(targetFrame)) || null
  }

  private getAllFrames(
    event: ExtensionEvent,
    details: chrome.webNavigation.GetFrameDetails
  ): chrome.webNavigation.GetAllFrameResultDetails[] | null {
    const tab = this.store.getTabById(details.tabId)
    if (!tab || !('mainFrame' in tab)) return []
    return (tab as any).mainFrame.framesInSubtree.map(getFrameDetails)
  }

  private sendNavigationEvent = (eventName: string, details: { url: string }) => {
    debug(`${eventName} [url: ${details.url}]`)
    this.store.sendToHosts(`webNavigation.${eventName}`, details)
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
    this.sendNavigationEvent('onCreatedNavigationTarget', details)
  }

  private onBeforeNavigate = (
    event: Electron.IpcMainEvent,
    url: string,
    isInPlace: number,
    isMainFrame: boolean,
    frameProcessId: number,
    frameRoutingId: number
  ) => {
    if (isInPlace) return

    const frame = getFrame(frameProcessId, frameRoutingId)
    const tab = event.sender
    const details: chrome.webNavigation.WebNavigationParentedCallbackDetails = {
      frameId: getFrameId(frame),
      parentFrameId: getParentFrameId(frame),
      processId: frameProcessId,
      tabId: tab.id,
      timeStamp: Date.now(),
      url,
    }

    this.sendNavigationEvent('onBeforeNavigate', details)
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
    const details: chrome.webNavigation.WebNavigationParentedCallbackDetails = {
      frameId: getFrameId(frame),
      parentFrameId: getParentFrameId(frame),
      processId: frameProcessId,
      tabId: tab.id,
      timeStamp: Date.now(),
      url,
    }
    this.sendNavigationEvent('onCommitted', details)
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
    const details: chrome.webNavigation.WebNavigationTransitionCallbackDetails & {
      parentFrameId: number
    } = {
      transitionType: '', // TODO
      transitionQualifiers: [], // TODO
      frameId: getFrameId(frame),
      parentFrameId: getParentFrameId(frame),
      processId: frameProcessId,
      tabId: tab.id,
      timeStamp: Date.now(),
      url,
    }
    this.sendNavigationEvent('onHistoryStateUpdated', details)
  }

  private onDOMContentLoaded = (event: Electron.IpcMainEvent, frame?: WebFrameMain) => {
    if (frame) {
      // If we've received a frame, Electron supports 'frame-dom-ready' and we
      // should disable 'dom-ready'.
      const tab = event.sender
      tab.off('dom-ready', this.onDOMContentLoaded)
    }

    const details: chrome.webNavigation.WebNavigationParentedCallbackDetails = {
      frameId: getFrameId(frame),
      parentFrameId: getParentFrameId(frame),
      processId: frame?.processId || -1,
      tabId: event.sender.id,
      timeStamp: Date.now(),
      url: frame?.url || event.sender.getURL(),
    }
    this.sendNavigationEvent('onDOMContentLoaded', details)

    if (!event.sender.isLoadingMainFrame()) {
      this.sendNavigationEvent('onCompleted', details)
    }
  }

  private onFinishLoad = (
    event: Electron.IpcMainEvent,
    isMainFrame: boolean,
    frameProcessId: number,
    frameRoutingId: number
  ) => {
    const frame = getFrame(frameProcessId, frameRoutingId)
    const tab = event.sender
    const url = tab.getURL()
    const details: chrome.webNavigation.WebNavigationParentedCallbackDetails = {
      frameId: getFrameId(frame),
      parentFrameId: getParentFrameId(frame),
      processId: frameProcessId,
      tabId: tab.id,
      timeStamp: Date.now(),
      url,
    }
    this.sendNavigationEvent('onCompleted', details)
  }
}
