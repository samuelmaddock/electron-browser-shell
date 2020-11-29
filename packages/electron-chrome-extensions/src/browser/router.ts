import { ipcMain, Session } from 'electron'

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
