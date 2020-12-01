import { BrowserWindow, Session } from 'electron'

const debug = require('debug')('electron-chrome-extensions:popup')

export interface PopupAnchorRect {
  x: number
  y: number
  width: number
  height: number
}

interface PopupViewOptions {
  extensionId: string
  session: Session
  parent: BrowserWindow
  url: string
  anchorRect: PopupAnchorRect
}

export class PopupView {
  static POSITION_PADDING = 5

  static BOUNDS = {
    minWidth: 25,
    minHeight: 25,
    maxWidth: 800,
    maxHeight: 600,
  }

  browserWindow?: BrowserWindow
  parent?: BrowserWindow
  extensionId: string

  private anchorRect: PopupAnchorRect
  private destroyed: boolean = false

  constructor(opts: PopupViewOptions) {
    this.parent = opts.parent
    this.extensionId = opts.extensionId
    this.anchorRect = opts.anchorRect

    this.browserWindow = new BrowserWindow({
      show: false,
      frame: false,
      parent: opts.parent,
      movable: false,
      maximizable: false,
      minimizable: false,
      skipTaskbar: true,
      backgroundColor: '#ffffff',
      webPreferences: {
        session: opts.session,
        sandbox: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        nativeWindowOpen: true,
        worldSafeExecuteJavaScript: true,
        contextIsolation: true,
        ...({
          preferredSizeMode: true,
        } as any),
      },
    })

    const untypedWebContents = this.browserWindow.webContents as any
    untypedWebContents.on('preferred-size-changed', this.updatePreferredSize)

    // Set default size where preferredSizeMode isn't supported
    this.browserWindow.setBounds({
      ...this.browserWindow.getBounds(),
      width: 256,
      height: 400,
    })

    this.updatePosition()

    this.browserWindow.webContents.on('devtools-closed', this.maybeClose)
    this.browserWindow.on('blur', this.maybeClose)
    this.browserWindow.on('closed', this.destroy)
    this.parent.once('closed', this.destroy)

    this.load(opts.url)
  }

  async load(url: string) {
    const win = this.browserWindow!

    try {
      await win.webContents.loadURL(url)
    } catch (e) {
      console.error(e)
    }

    if (this.destroyed) return
    win.show()
  }

  destroy = () => {
    if (this.destroyed) return

    this.destroyed = true

    debug(`destroying ${this.extensionId}`)

    if (this.parent) {
      if (!this.parent.isDestroyed()) {
        this.parent.off('closed', this.destroy)
      }
      this.parent = undefined
    }

    if (this.browserWindow) {
      if (!this.browserWindow.isDestroyed()) {
        const { webContents } = this.browserWindow

        if (!webContents.isDestroyed() && webContents.isDevToolsOpened()) {
          webContents.closeDevTools()
        }

        this.browserWindow.off('closed', this.destroy)
        this.browserWindow.destroy()
      }

      this.browserWindow = undefined
    }
  }

  isDestroyed() {
    return this.destroyed
  }

  private maybeClose = () => {
    // Keep open if webContents is being inspected
    if (!this.browserWindow?.isDestroyed() && this.browserWindow?.webContents.isDevToolsOpened()) {
      debug('preventing close due to DevTools being open')
      return
    }

    this.destroy()
  }

  private updatePosition() {
    if (!this.browserWindow || !this.parent) return

    const winBounds = this.parent.getBounds()
    const viewBounds = this.browserWindow.getBounds()

    // TODO: support more orientations than just top-right
    let x = winBounds.x + this.anchorRect.x + this.anchorRect.width - viewBounds.width
    let y = winBounds.y + this.anchorRect.y + this.anchorRect.height + PopupView.POSITION_PADDING

    // Convert to ints
    x = Math.floor(x)
    y = Math.floor(y)

    debug(`updatePosition`, { x, y })

    this.browserWindow.setBounds({
      ...this.browserWindow.getBounds(),
      x,
      y,
    })
  }

  private updatePreferredSize = (event: Electron.Event, size: Electron.Size) => {
    if (!this.browserWindow || !this.parent) return

    const windowWidth = this.parent.getSize()[0]

    this.browserWindow?.setBounds({
      x: windowWidth - size.width,
      y: 0,
      width: Math.min(PopupView.BOUNDS.maxWidth, Math.max(size.width, PopupView.BOUNDS.minWidth)),
      height: Math.min(
        PopupView.BOUNDS.maxHeight,
        Math.max(size.height, PopupView.BOUNDS.minHeight)
      ),
    })

    this.updatePosition()
  }
}
