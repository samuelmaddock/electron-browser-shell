import { Extension, ipcMain, session, Session, WebContents } from 'electron'
import { getExtensionIdFromWebContents } from './api/common'
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

type HandlerMap = Map<string, Handler>

interface SessionRoutingDetails {
  handlers: HandlerMap
  // TODO: need to wakeup extension hosts
  listeners: Map</* extensionId */ string, Set</* eventName */ string>>
}

let gRouter: ExtensionRouter | undefined

export class ExtensionRouter {
  private sessionMap: WeakMap<Session, SessionRoutingDetails> = new WeakMap()

  static get() {
    return gRouter || (gRouter = new ExtensionRouter())
  }

  private constructor() {
    ipcMain.handle('CHROME_EXT', this.onRouterMessage)
    ipcMain.handle('CHROME_EXT_REMOTE', this.onRemoteMessage)
    ipcMain.on('CRX_SET_LISTENER', this.onUpdateEventListener)
  }

  private onUpdateEventListener = (
    event: Electron.IpcMainInvokeEvent,
    eventName: string,
    enabled: boolean
  ) => {
    const { listeners } = this.getSessionDetails(event.sender.session)

    const extensionId = getExtensionIdFromWebContents(event.sender)
    if (!extensionId) {
      throw new Error(
        `no extension id for sender [id:${event.sender.id}, type:${event.sender.getType()}, url:${
          event.sender.mainFrame.url
        }]`
      )
    }

    // TODO: clear out extension state on unloaded

    if (!listeners.has(extensionId)) {
      listeners.set(extensionId, new Set())
    }

    const extensionEvents = listeners.get(extensionId)!

    if (enabled) {
      debug(`adding '${eventName}' event listener for ${extensionId}`)
      extensionEvents.add(eventName)
    } else {
      debug(`removing '${eventName}' event listener for ${extensionId}`)
      extensionEvents.delete(eventName)
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
    handlerName: string,
    args: any[]
  ) {
    const { sender } = event
    const handler = this.getHandler(session, handlerName)

    if (sender.session !== session && !handler.allowRemote) {
      throw new Error(`${handlerName} does not support calling from a remote session`)
    }

    const extensionId = getExtensionIdFromWebContents(sender)
    if (!extensionId && handler.extensionContext) {
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
    handlerName: string,
    ...args: any[]
  ) => {
    debug(`received '${handlerName}'`, args)
    return this.invokeHandler(event, event.sender.session, handlerName, args)
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
    return this.invokeHandler(event, ses, handlerName, args)
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
  sendEvent(ctx: ExtensionContext, extensionId: string, eventName: string, ...args: any[]) {
    // TODO: don't store listeners by extension ID. Instead need to store context to lookup each like
    // process host or service worker url
    const { listeners } = this.getSessionDetails(ctx.session)

    if (extensionId) {
      // TODO: ignore if listener isn't present
      const hasListener = listeners.get(extensionId)?.has(eventName)

      if (!hasListener) {
        debug(`ignoring '${eventName}' event with no listeners for ${extensionId}`)
        return
      }
    }

    // TODO: extension permissions check

    const host = ctx.store.extensionIdToHost.get(extensionId)

    // TODO: may need to wake lazy extension context
    if (!host) {
      throw new Error(`Unable to send '${eventName}' to extension host for ${extensionId}`)
    }

    const ipcName = `CRX_${eventName}`
    host.send(ipcName, ...args)
  }

  /** Broadcasts extension event to all extension hosts listening for it. */
  broadcastEvent(ctx: ExtensionContext, eventName: string, ...args: any[]) {
    for (const [extensionId, host] of ctx.store.extensionIdToHost) {
      if (host.isDestroyed()) {
        console.error(`Unable to send '${eventName}' to extension host`)
        return
      }

      this.sendEvent(ctx, extensionId, eventName, ...args)
    }
  }
}
