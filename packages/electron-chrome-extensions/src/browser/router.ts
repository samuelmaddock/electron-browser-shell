import { Extension, ipcMain, session, Session, WebContents } from 'electron'

const createDebug = require('debug')

// Shorten base64 encoded icons
const shortenValues = (k: string, v: any) =>
  typeof v === 'string' && v.length > 128 ? v.substr(0, 128) + '...' : v

createDebug.formatters.r = (value: any) => {
  return value ? JSON.stringify(value, shortenValues, '  ') : value
}

const debug = createDebug('electron-chrome-extensions:router')

const DEFAULT_SESSION = '_self'

const getExtensionFromWebContents = (webContents: WebContents) => {
  let extensionId
  try {
    const url = new URL(webContents.getURL())
    extensionId = url.hostname
  } catch {
    return
  }
  return webContents.session.getExtension(extensionId)
}

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

let gRouter: ExtensionRouter | undefined

export class ExtensionRouter {
  private sessionMap: WeakMap<Session, HandlerMap> = new WeakMap()

  static get() {
    return gRouter || (gRouter = new ExtensionRouter())
  }

  private constructor() {
    ipcMain.handle('CHROME_EXT', this.onRouterMessage)
    ipcMain.handle('CHROME_EXT_REMOTE', this.onRemoteMessage)
  }

  private getHandler(session: Electron.Session, handlerName: string) {
    if (typeof handlerName !== 'string') {
      throw new Error('handlerName must be of type string')
    }

    const sessionMap = this.sessionMap.get(session)
    if (!sessionMap) {
      throw new Error("Chrome extensions are not supported in the sender's session")
    }

    const handler = sessionMap.get(handlerName)
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

    const extension = getExtensionFromWebContents(sender)
    if (!extension && handler.extensionContext) {
      throw new Error(`${handlerName} was sent from an unknown extension context`)
    }

    const extEvent = { sender, extension: extension! }
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

  private getSessionHandlers(session: Session) {
    if (!this.sessionMap.has(session)) {
      this.sessionMap.set(session, new Map())
    }
    return this.sessionMap.get(session)!
  }

  handle(session: Session, name: string, callback: HandlerCallback, opts?: HandlerOptions): void {
    const handlers = this.getSessionHandlers(session)

    handlers.set(name, {
      callback,
      extensionContext: typeof opts?.extensionContext === 'boolean' ? opts.extensionContext : true,
      allowRemote: typeof opts?.allowRemote === 'boolean' ? opts.allowRemote : false,
    })
  }
}
