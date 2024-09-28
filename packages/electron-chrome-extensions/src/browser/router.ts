import { app, Extension, ipcMain, session, Session, WebContents } from 'electron'

const createDebug = require('debug')

// Shorten base64 encoded icons
const shortenValues = (k: string, v: any) =>
  typeof v === 'string' && v.length > 128 ? v.substr(0, 128) + '...' : v

createDebug.formatters.r = (value: any) => {
  return value ? JSON.stringify(value, shortenValues, '  ') : value
}

const getSessionFromEvent = (event: any): Electron.Session => {
  if (event.type === 'service-worker') {
    return event.session
  } else {
    return event.sender.session
  }
}

// TODO(mv3): add types
const getHostFromEvent = (event: any) => {
  if (event.type === 'service-worker') {
    const serviceWorker = event.session.serviceWorkers.fromVersionID(event.versionId)
    return serviceWorker && !serviceWorker.isDestroyed() ? serviceWorker : null
  } else {
    return event.sender
  }
}

const debug = createDebug('electron-chrome-extensions:router')

const DEFAULT_SESSION = '_self'

interface RoutingDelegateObserver {
  session: Electron.Session
  onExtensionMessage(
    event: Electron.IpcMainInvokeEvent,
    extensionId: string | undefined,
    handlerName: string,
    ...args: any[]
  ): Promise<void>
  addListener(listener: EventListener, extensionId: string, eventName: string): void
  removeListener(listener: EventListener, extensionId: string, eventName: string): void
}

let gRoutingDelegate: RoutingDelegate

/**
 * Handles event routing IPCs and delivers them to the observer with the
 * associated session.
 */
class RoutingDelegate {
  static get() {
    return gRoutingDelegate || (gRoutingDelegate = new RoutingDelegate())
  }

  private sessionMap: WeakMap<Session, RoutingDelegateObserver> = new WeakMap()
  private workers: WeakSet<any> = new WeakSet()

  private constructor() {
    ipcMain.handle('crx-msg', this.onRouterMessage)
    ipcMain.handle('crx-msg-remote', this.onRemoteMessage)
    ipcMain.on('crx-add-listener', this.onAddListener)
    ipcMain.on('crx-remove-listener', this.onRemoveListener)
  }

  addObserver(observer: RoutingDelegateObserver) {
    this.sessionMap.set(observer.session, observer)

    // TODO(mv3): remove anys
    const maybeListenForWorkerEvents = ({ runningStatus, versionId }: any) => {
      if (runningStatus !== 'starting') return

      const serviceWorker = (observer.session as any).serviceWorkers.fromVersionID(versionId)
      if (
        serviceWorker?.scope?.startsWith('chrome-extension://') &&
        !this.workers.has(serviceWorker)
      ) {
        debug(`listening to service worker [versionId:${versionId}, scope:${serviceWorker.scope}]`)
        this.workers.add(serviceWorker)
        serviceWorker.ipc.handle('crx-msg', this.onRouterMessage)
        serviceWorker.ipc.handle('crx-msg-remote', this.onRemoteMessage)
        serviceWorker.ipc.on('crx-add-listener', this.onAddListener)
        serviceWorker.ipc.on('crx-remove-listener', this.onRemoveListener)
      }
    }
    observer.session.serviceWorkers.on('running-status-changed' as any, maybeListenForWorkerEvents)
  }

  private onRouterMessage = async (
    event: Electron.IpcMainInvokeEvent,
    extensionId: string,
    handlerName: string,
    ...args: any[]
  ) => {
    debug(`received '${handlerName}'`, args)

    const observer = this.sessionMap.get(getSessionFromEvent(event))

    return observer?.onExtensionMessage(event, extensionId, handlerName, ...args)
  }

  private onRemoteMessage = async (
    event: Electron.IpcMainInvokeEvent,
    sessionPartition: string,
    handlerName: string,
    ...args: any[]
  ) => {
    debug(`received remote '${handlerName}' for '${sessionPartition}'`, args)

    const ses =
      sessionPartition === DEFAULT_SESSION
        ? getSessionFromEvent(event)
        : session.fromPartition(sessionPartition)

    const observer = this.sessionMap.get(ses)

    return observer?.onExtensionMessage(event, undefined, handlerName, ...args)
  }

  private onAddListener = (
    event: Electron.IpcMainInvokeEvent,
    extensionId: string,
    eventName: string,
  ) => {
    const observer = this.sessionMap.get(getSessionFromEvent(event))
    const host = getHostFromEvent(event)
    const listener: EventListener = { host, extensionId }
    return observer?.addListener(listener, extensionId, eventName)
  }

  private onRemoveListener = (
    event: Electron.IpcMainInvokeEvent,
    extensionId: string,
    eventName: string,
  ) => {
    const observer = this.sessionMap.get(getSessionFromEvent(event))
    const host = getHostFromEvent(event)
    const listener: EventListener = { host, extensionId }
    return observer?.removeListener(listener, extensionId, eventName)
  }
}

export interface ExtensionEvent {
  sender?: any // TODO(mv3): types
  extension: Extension
}

export type HandlerCallback = (event: ExtensionEvent, ...args: any[]) => any

export interface HandlerOptions {
  /** Whether the handler can be invoked on behalf of a different session. */
  allowRemote?: boolean
  /** Whether an extension context is required to invoke the handler. */
  extensionContext: boolean
}

interface Handler extends HandlerOptions {
  callback: HandlerCallback
}

/** e.g. 'tabs.query' */
type EventName = string

type HandlerMap = Map<EventName, Handler>

interface EventListener {
  // TODO(mv3): host: Electron.WebContents | Electron.ServiceWorkerMain
  host: any
  extensionId: string
}

const getHostId = (host: EventListener['host']) => host.id || host.versionId
const getHostUrl = (host: EventListener['host']) => host.getURL?.() || host.scope

const eventListenerEquals = (eventListener: EventListener) => (other: EventListener) =>
  other.host === eventListener.host && other.extensionId === eventListener.extensionId

export class ExtensionRouter {
  private handlers: HandlerMap = new Map()
  private listeners: Map<EventName, EventListener[]> = new Map()

  /**
   * Collection of all extension hosts in the session.
   *
   * Currently the router has no ability to wake up non-persistent background
   * scripts to deliver events. For now we just hold a reference to them to
   * prevent them from being terminated.
   */
  private extensionHosts: Set<Electron.WebContents> = new Set()

  private extensionWorkers: Set<any> = new Set()

  constructor(
    public session: Electron.Session,
    private delegate: RoutingDelegate = RoutingDelegate.get(),
  ) {
    this.delegate.addObserver(this)

    session.on('extension-unloaded', (event, extension) => {
      this.filterListeners((listener) => listener.extensionId !== extension.id)
    })

    app.on('web-contents-created', (event, webContents) => {
      if (webContents.session === this.session && webContents.getType() === 'backgroundPage') {
        debug(`storing reference to background host [url:'${webContents.getURL()}']`)
        this.extensionHosts.add(webContents)
      }
    })

    session.serviceWorkers.on('running-status-changed' as any, ({ runningStatus, versionId }: any) => {
      if (runningStatus !== 'starting') return

      const serviceWorker = (session as any).serviceWorkers.fromVersionID(versionId)
      if (serviceWorker) {
        debug(`storing reference to background service worker [url:'${serviceWorker.scope}']`)
        this.extensionWorkers.add(serviceWorker)
      }
    })
  }

  private filterListeners(predicate: (listener: EventListener) => boolean) {
    for (const [eventName, listeners] of this.listeners) {
      const filteredListeners = listeners.filter(predicate)
      const delta = listeners.length - filteredListeners.length

      if (filteredListeners.length > 0) {
        this.listeners.set(eventName, filteredListeners)
      } else {
        this.listeners.delete(eventName)
      }

      if (delta > 0) {
        debug(`removed ${delta} listener(s) for '${eventName}'`)
      }
    }
  }

  private observeListenerHost(host: EventListener['host']) {
    const hostId = getHostId(host)
    debug(`observing listener [id:${hostId}, url:'${getHostUrl(host)}']`)
    host.once('destroyed', () => {
      debug(`extension host destroyed [id:${hostId}]`)
      this.filterListeners((listener) => listener.host !== host)
    })
  }

  addListener(listener: EventListener, extensionId: string, eventName: string) {
    const { listeners, session } = this

    const extension = session.getExtension(extensionId)
    if (!extension) {
      throw new Error(`extension not registered in session [extensionId:${extensionId}]`)
    }

    if (!listeners.has(eventName)) {
      listeners.set(eventName, [])
    }

    const eventListeners = listeners.get(eventName)!
    const existingEventListener = eventListeners.find(eventListenerEquals(listener))

    if (existingEventListener) {
      debug(`ignoring existing '${eventName}' event listener for ${extensionId}`)
    } else {
      debug(`adding '${eventName}' event listener for ${extensionId}`)
      eventListeners.push(listener)
      this.observeListenerHost(listener.host)
    }
  }

  removeListener(listener: EventListener, extensionId: string, eventName: string) {
    const { listeners } = this

    const eventListeners = listeners.get(eventName)
    if (!eventListeners) {
      console.error(`event listener not registered for '${eventName}'`)
      return
    }

    const index = eventListeners.findIndex(eventListenerEquals(listener))

    if (index >= 0) {
      debug(`removing '${eventName}' event listener for ${extensionId}`)
      eventListeners.splice(index, 1)
    }

    if (eventListeners.length === 0) {
      listeners.delete(eventName)
    }
  }

  private getHandler(handlerName: string) {
    const handler = this.handlers.get(handlerName)
    if (!handler) {
      throw new Error(`${handlerName} is not a registered handler`)
    }

    return handler
  }

  async onExtensionMessage(
    event: Electron.IpcMainInvokeEvent,
    extensionId: string | undefined,
    handlerName: string,
    ...args: any[]
  ) {
    const { session } = this
    const eventSession = getSessionFromEvent(event)
    const handler = this.getHandler(handlerName)

    if (eventSession !== session && !handler.allowRemote) {
      throw new Error(`${handlerName} does not support calling from a remote session`)
    }

    const extension = extensionId ? eventSession.getExtension(extensionId) : undefined
    if (!extension && handler.extensionContext) {
      throw new Error(`${handlerName} was sent from an unknown extension context`)
    }

    const extEvent: ExtensionEvent = {
      // TODO(mv3): handle types
      sender: event.sender || (event as any).worker,
      extension: extension!,
    }

    const result = await handler.callback(extEvent, ...args)

    debug(`${handlerName} result: %r`, result)

    return result
  }

  private handle(name: string, callback: HandlerCallback, opts?: HandlerOptions): void {
    this.handlers.set(name, {
      callback,
      extensionContext: typeof opts?.extensionContext === 'boolean' ? opts.extensionContext : true,
      allowRemote: typeof opts?.allowRemote === 'boolean' ? opts.allowRemote : false,
    })
  }

  /** Returns a callback to register API handlers for the given context. */
  apiHandler() {
    return (name: string, callback: HandlerCallback, opts?: HandlerOptions) => {
      this.handle(name, callback, opts)
    }
  }

  /**
   * Sends extension event to the host for the given extension ID if it
   * registered a listener for it.
   */
  sendEvent(extensionId: string | undefined, eventName: string, ...args: any[]) {
    const { listeners } = this

    let eventListeners = listeners.get(eventName)

    if (extensionId) {
      // TODO: extension permissions check

      eventListeners = eventListeners?.filter((el) => el.extensionId === extensionId)
    }

    if (!eventListeners || eventListeners.length === 0) {
      debug(`ignoring '${eventName}' event with no listeners`)
      return
    }

    let sentCount = 0
    for (const { host } of eventListeners) {
      const ipcName = `crx-${eventName}`
      const send = () => {
        if (host.isDestroyed()) {
          console.error(`Unable to send '${eventName}' to extension host for ${extensionId}`)
          return
        }
        host.send(ipcName, ...args)
      }

      if (host.constructor.name === 'ServiceWorkerMain') {
        if (host.isDestroyed()) {
          console.error(`Service Worker is destroyed.\nUnable to send '${eventName}' to extension host for ${extensionId}`)
          return
        }
        host.startWorker().then(send)
      } else {
        send()
      }

      sentCount++
    }

    debug(`sent '${eventName}' event to ${sentCount} listeners`)
  }

  /** Broadcasts extension event to all extension hosts listening for it. */
  broadcastEvent(eventName: string, ...args: any[]) {
    this.sendEvent(undefined, eventName, ...args)
  }
}
