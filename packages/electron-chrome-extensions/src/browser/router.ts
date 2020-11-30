import { ipcMain, Session } from 'electron'

const createDebug = require('debug')

// Shorten base64 encoded icons
const shortenValues = (k: string, v: any) =>
  typeof v === 'string' && v.length > 128 ? v.substr(0, 128) + '...' : v

createDebug.formatters.r = (value: any) => {
  return value ? JSON.stringify(value, shortenValues, '  ') : value
}

const debug = createDebug('electron-chrome-extensions:router')

export type Handler = (event: Electron.IpcMainInvokeEvent, ...args: any[]) => void

type HandlerMap = Map<string, Handler>

let gRouter: ExtensionRouter | undefined

export class ExtensionRouter {
  private sessionMap: WeakMap<Session, HandlerMap> = new WeakMap()

  static get() {
    return gRouter || (gRouter = new ExtensionRouter())
  }

  private constructor() {
    ipcMain.handle('CHROME_EXT', this.onRouterMessage)
  }

  private onRouterMessage = async (
    event: Electron.IpcMainInvokeEvent,
    handlerName: string,
    ...args: any[]
  ) => {
    debug(`received '${handlerName}'`, args)

    if (typeof handlerName !== 'string') {
      throw new Error('handlerName must be of type string')
    }

    const sessionMap = this.sessionMap.get(event.sender.session)
    if (!sessionMap) {
      throw new Error("Chrome extensions are not supported in the sender's session")
    }

    const handler = sessionMap.get(handlerName)
    if (!handler) {
      throw new Error(`${handlerName} is not a registered handler`)
    }

    const result = await handler(event, ...args)

    debug(`${handlerName} result: %r`, result)

    return result
  }

  private getSessionHandlers(session: Session) {
    if (!this.sessionMap.has(session)) {
      this.sessionMap.set(session, new Map())
    }
    return this.sessionMap.get(session)!
  }

  handle(session: Session, name: string, callback: Handler): void {
    const handlers = this.getSessionHandlers(session)

    handlers.set(name, callback)
  }
}
