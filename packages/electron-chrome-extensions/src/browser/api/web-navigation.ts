import * as electron from 'electron'
import { ExtensionContext } from '../context'
import { ExtensionEvent } from '../router'

const debug = require('debug')('electron-chrome-extensions:webNavigation')

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
  const parentFrame = frame?.parent
  return parentFrame ? getFrameId(parentFrame) : -1
}

const getFrameDetails = (frame: any) => ({
  errorOccurred: false, // TODO
  processId: frame.processId,
  frameId: getFrameId(frame),
  parentFrameId: getParentFrameId(frame),
  url: frame.url,
})

export class WebNavigationAPI {
  constructor(private ctx: ExtensionContext) {
    const handle = this.ctx.router.apiHandler()
    handle('webNavigation.getFrame', this.getFrame.bind(this))
    handle('webNavigation.getAllFrames', this.getAllFrames.bind(this))

    this.ctx.store.on('tab-added', this.observeTab.bind(this))
  }

  private observeTab(tab: Electron.WebContents) {
    tab.once('will-navigate', this.onCreatedNavigationTarget.bind(this, tab))
    tab.on('did-start-navigation', this.onBeforeNavigate.bind(this, tab))
    tab.on('did-frame-finish-load', this.onFinishLoad.bind(this, tab))
    tab.on('did-frame-navigate', this.onCommitted.bind(this, tab))
    tab.on('did-navigate-in-page', this.onHistoryStateUpdated.bind(this, tab))

    tab.on('frame-created', (e, { frame }) => {
      if (frame.top === frame) return

      frame.on('dom-ready', () => {
        this.onDOMContentLoaded(tab, frame)
      })
    })

    // Main frame dom-ready event
    tab.on('dom-ready', () => {
      if ('mainFrame' in tab) {
        this.onDOMContentLoaded(tab, tab.mainFrame)
      }
    })
  }

  private getFrame(
    event: ExtensionEvent,
    details: chrome.webNavigation.GetFrameDetails
  ): chrome.webNavigation.GetFrameResultDetails | null {
    const tab = this.ctx.store.getTabById(details.tabId)
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
    event: ExtensionEvent,
    details: chrome.webNavigation.GetFrameDetails
  ): chrome.webNavigation.GetAllFrameResultDetails[] | null {
    const tab = this.ctx.store.getTabById(details.tabId)
    if (!tab || !('mainFrame' in tab)) return []
    return (tab as any).mainFrame.framesInSubtree.map(getFrameDetails)
  }

  private sendNavigationEvent = (eventName: string, details: { url: string }) => {
    debug(`${eventName} [url: ${details.url}]`)
    this.ctx.router.broadcastEvent(`webNavigation.${eventName}`, details)
  }

  private onCreatedNavigationTarget = (
    tab: Electron.WebContents,
    event: Electron.Event<Electron.WebContentsWillNavigateEventParams>,
    ...args: any[]
  ) => {
    // Defaults for backwards compat prior to electron@25.0.0
    const { url = args[0] as string, frame = getFrame(args[3], args[4]) as Electron.WebFrameMain } =
      event

    const details: chrome.webNavigation.WebNavigationSourceCallbackDetails = {
      sourceTabId: tab.id,
      sourceProcessId: frame ? frame.processId : -1,
      sourceFrameId: getFrameId(frame),
      url,
      tabId: tab.id,
      timeStamp: Date.now(),
    }
    this.sendNavigationEvent('onCreatedNavigationTarget', details)
  }

  private onBeforeNavigate = (
    tab: Electron.WebContents,
    event: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>,
    ...args: any[]
  ) => {
    // Defaults for backwards compat prior to electron@25.0.0
    const {
      url = args[0] as string,
      isSameDocument = args[1] as boolean,
      frame = getFrame(args[3], args[4]) as Electron.WebFrameMain,
    } = event

    if (isSameDocument) return

    const details: chrome.webNavigation.WebNavigationParentedCallbackDetails = {
      frameId: getFrameId(frame),
      parentFrameId: getParentFrameId(frame),
      processId: frame ? frame.processId : -1,
      tabId: tab.id,
      timeStamp: Date.now(),
      url,
    }

    this.sendNavigationEvent('onBeforeNavigate', details)
  }

  private onCommitted = (
    tab: Electron.WebContents,
    event: Electron.Event,
    url: string,
    httpResponseCode: number,
    httpStatusText: string,
    isMainFrame: boolean,
    frameProcessId: number,
    frameRoutingId: number
  ) => {
    const frame = getFrame(frameProcessId, frameRoutingId)
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
    tab: Electron.WebContents,
    event: Electron.Event,
    url: string,
    isMainFrame: boolean,
    frameProcessId: number,
    frameRoutingId: number
  ) => {
    const frame = getFrame(frameProcessId, frameRoutingId)
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

  private onDOMContentLoaded = (tab: Electron.WebContents, frame: Electron.WebFrameMain) => {
    const details: chrome.webNavigation.WebNavigationParentedCallbackDetails = {
      frameId: getFrameId(frame),
      parentFrameId: getParentFrameId(frame),
      processId: frame.processId,
      tabId: tab.id,
      timeStamp: Date.now(),
      url: frame.url,
    }
    this.sendNavigationEvent('onDOMContentLoaded', details)

    if (!tab.isLoadingMainFrame()) {
      this.sendNavigationEvent('onCompleted', details)
    }
  }

  private onFinishLoad = (
    tab: Electron.WebContents,
    event: Electron.Event,
    isMainFrame: boolean,
    frameProcessId: number,
    frameRoutingId: number
  ) => {
    const frame = getFrame(frameProcessId, frameRoutingId)
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
