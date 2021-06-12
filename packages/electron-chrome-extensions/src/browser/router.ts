import { Extension, ipcMain, session, Session, WebContents } from 'electron'
import { ExtensionContext } from './context'

const createDebug = require('debug')

// Shorten base64 encoded icons
const shortenValues = (k: string, v: any) =>
  typeof v === 'string' && v.length > 128 ? v.substr(0, 128) + '...' : v

createDebug.formatters.r = (value: any) => {
  return value ? JSON.stringify(value, shortenValues, '  ') : value
}

const debug = createDebug('electron-chrome-extensions:router')

const DEFAULT_SESSION = '_self'

export interface ExtensionEvent {
  sender: WebContents
  extension: Extension
}

export type HandlerCallback = (event: ExtensionEvent, ...args: any[]) => void

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
  host: Electron.WebContents
  extensionId: string
}

interface SessionRoutingDetails {
  handlers: HandlerMap
  listeners: Map<EventName, EventListener[]>
}

const eventListenerEquals = (eventListener: EventListener) => (other: EventListener) =>
  other.host === eventListener.host && other.extensionId === eventListener.extensionId

let gRouter: ExtensionRouter | undefined

export class ExtensionRouter {
  private sessionMap: WeakMap<Session, SessionRoutingDetails> = new WeakMap()

  static get() {
    return gRouter || (gRouter = new ExtensionRouter())
  }

  private constructor() {
    ipcMain.handle('crx-msg', this.onRouterMessage)
    ipcMain.handle('crx-msg-remote', this.onRemoteMessage)
    ipcMain.on('crx-add-listener', this.onAddListener)
    ipcMain.on('crx-remove-listener', this.onRemoveListener)
  }

  private onAddListener = (
    event: Electron.IpcMainInvokeEvent,
    extensionId: string,
    eventName: string
  ) => {
    const { session } = event.sender
    const { listeners } = this.getSessionDetails(session)

    const extension = session.getExtension(extensionId)
    if (!extension) {
      throw new Error(`extension not registered in session [extensionId:${extensionId}]`)
    }

    const eventListener: EventListener = { host: event.sender, extensionId }

    // TODO: clear out extension state on unloaded

    if (!listeners.has(eventName)) {
      listeners.set(eventName, [])
    }

    const eventListeners = listeners.get(eventName)!
    const existingEventListener = eventListeners.find(eventListenerEquals(eventListener))

    if (existingEventListener) {
      debug(`ignoring existing '${eventName}' event listener for ${extensionId}`)
    } else {
      debug(`adding '${eventName}' event listener for ${extensionId}`)
      eventListeners.push(eventListener)
    }
  }

  // TODO: need to cleanup listeners ourselves when a webcontents is destroyed
  private onRemoveListener = (
    event: Electron.IpcMainInvokeEvent,
    extensionId: string,
    eventName: string
  ) => {
    const { listeners } = this.getSessionDetails(event.sender.session)

    const eventListeners = listeners.get(eventName)
    if (!eventListeners) {
      console.error(`event listener not registered for '${eventName}'`)
      return
    }

    const eventListener: EventListener = { host: event.sender, extensionId }

    const index = eventListeners.findIndex(eventListenerEquals(eventListener))

    if (index >= 0) {
      debug(`removing '${eventName}' event listener for ${extensionId}`)
      eventListeners.splice(index, 1)
    }

    if (eventListeners.length === 0) {
      listeners.delete(eventName)
    }
  }

  private getHandler(session: Electron.Session, handlerName: string) {
    if (typeof handlerName !== 'string') {
      throw new Error('handlerName must be of type string')
    }

    const sessionDetails = this.sessionMap.get(session)
    if (!sessionDetails) {
      throw new Error("Chrome extensions are not supported in the sender's session")
    }

    const handler = sessionDetails.handlers.get(handlerName)
    if (!handler) {
      throw new Error(`${handlerName} is not a registered handler`)
    }

    return handler
  }

  private async invokeHandler(
    event: Electron.IpcMainInvokeEvent,
    session: Electron.Session,
    extensionId: string | undefined,
    handlerName: string,
    args: any[]
  ) {
    const { sender } = event
    const handler = this.getHandler(session, handlerName)

    if (sender.session !== session && !handler.allowRemote) {
      throw new Error(`${handlerName} does not support calling from a remote session`)
    }

    const extension = extensionId ? sender.session.getExtension(extensionId) : undefined
    if (!extension && handler.extensionContext) {
      throw new Error(`${handlerName} was sent from an unknown extension context`)
    }

    const extEvent = {
      sender,
      get extension() {
        return session.getExtension(extensionId!)
      },
    }

    const result = await handler.callback(extEvent, ...args)

    debug(`${handlerName} result: %r`, result)

    return result
  }

  private onRouterMessage = (
    event: Electron.IpcMainInvokeEvent,
    extensionId: string,
    handlerName: string,
    ...args: any[]
  ) => {
    debug(`received '${handlerName}'`, args)
    return this.invokeHandler(event, event.sender.session, extensionId, handlerName, args)
  }

  private onRemoteMessage = (
    event: Electron.IpcMainInvokeEvent,
    sessionPartition: string,
    handlerName: string,
    ...args: any[]
  ) => {
    debug(`received remote '${handlerName}' for '${sessionPartition}'`, args)
    const ses =
      sessionPartition === DEFAULT_SESSION
        ? event.sender.session
        : session.fromPartition(sessionPartition)
    return this.invokeHandler(event, ses, undefined, handlerName, args)
  }

  private getSessionDetails(session: Session) {
    // TODO: we should only create session details if ElectronChromeExtensions has been created
    // for the given session.
    if (!this.sessionMap.has(session)) {
      this.sessionMap.set(session, { handlers: new Map(), listeners: new Map() })
    }
    return this.sessionMap.get(session)!
  }

  private handle(
    session: Session,
    name: string,
    callback: HandlerCallback,
    opts?: HandlerOptions
  ): void {
    const { handlers } = this.getSessionDetails(session)

    handlers.set(name, {
      callback,
      extensionContext: typeof opts?.extensionContext === 'boolean' ? opts.extensionContext : true,
      allowRemote: typeof opts?.allowRemote === 'boolean' ? opts.allowRemote : false,
    })
  }

  /** Returns a callback to register API handlers for the given context. */
  apiHandler(ctx: ExtensionContext) {
    return (name: string, callback: HandlerCallback, opts?: HandlerOptions) => {
      this.handle(ctx.session, name, callback, opts)
    }
  }

  /**
   * Sends extension event to the host for the given extension ID if it
   * registered a listener for it.
   */
  sendEvent(
    ctx: ExtensionContext,
    extensionId: string | undefined,
    eventName: string,
    ...args: any[]
  ) {
    const { listeners } = this.getSessionDetails(ctx.session)

    let eventListeners = listeners.get(eventName)

    if (extensionId) {
      // TODO: extension permissions check

      eventListeners = eventListeners?.filter((el) => el.extensionId === extensionId)
    }

    if (!eventListeners || eventListeners.length === 0) {
      debug(`ignoring '${eventName}' event with no listeners`)
      return
    }

    for (const { host } of eventListeners) {
      // TODO: may need to wake lazy extension context
      if (host.isDestroyed()) {
        // TODO: cleanup this listener?
        throw new Error(`Unable to send '${eventName}' to extension host for ${extensionId}`)
      }

      const ipcName = `crx-${eventName}`
      host.send(ipcName, ...args)
    }
  }

  /** Broadcasts extension event to all extension hosts listening for it. */
  broadcastEvent(ctx: ExtensionContext, eventName: string, ...args: any[]) {
    this.sendEvent(ctx, undefined, eventName, ...args)
  }
}
