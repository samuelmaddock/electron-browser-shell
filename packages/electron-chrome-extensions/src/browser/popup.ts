import { BrowserView, BrowserWindow } from 'electron'

const debug = require('debug')('electron-chrome-extensions:popup')

export interface PopupAnchorRect {
  x: number
  y: number
  width: number
  height: number
}

interface PopupViewOptions {
  extensionId: string
  browserWindow: BrowserWindow
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

  browserView?: BrowserView
  browserWindow?: BrowserWindow
  extensionId: string

  private anchorRect: PopupAnchorRect
  private destroyed: boolean = false

  constructor(opts: PopupViewOptions) {
    this.browserWindow = opts.browserWindow
    this.extensionId = opts.extensionId
    this.anchorRect = opts.anchorRect

    this.browserView = new BrowserView({
      webPreferences: {
        contextIsolation: true,
        preferredSizeMode: true,
      } as any,
    })

    const untypedWebContents = this.browserView.webContents as any
    untypedWebContents.on('preferred-size-changed', this.updatePreferredSize)

    this.browserView.setBackgroundColor('#ff0000')
    this.browserView.webContents.loadURL(opts.url)

    this.browserWindow.addBrowserView(this.browserView)
    this.browserView.webContents.focus()

    // Set default size where preferredSizeMode isn't supported
    this.browserView.setBounds({
      ...this.browserView.getBounds(),
      width: 256,
      height: 400,
    })

    this.updatePosition()

    // TODO:
    this.browserView.webContents.once('blur' as any, this.destroy)

    this.browserWindow.once('closed', this.destroy)
  }

  destroy = () => {
    if (this.destroyed) return

    if (this.browserView) {
      if (this.browserWindow) {
        if (!this.browserWindow.isDestroyed()) {
          this.browserWindow.off('closed', this.destroy)
          this.browserWindow.removeBrowserView(this.browserView)
        }
        this.browserWindow = undefined
      }

      const { webContents } = this.browserView

      if (!webContents.isDestroyed() && webContents.isDevToolsOpened()) {
        webContents.closeDevTools()
      }

      this.browserView = undefined
    }

    this.destroyed = true
  }

  isDestroyed() {
    return this.destroyed
  }

  private updatePosition() {
    if (!this.browserView || !this.browserWindow) return

    const winBounds = this.browserWindow.getContentBounds()
    const viewBounds = this.browserView.getBounds()

    // TODO: support more orientations than just top-right
    let x = this.anchorRect.x + this.anchorRect.width - viewBounds.width
    let y = this.anchorRect.y + this.anchorRect.height + PopupView.POSITION_PADDING

    // Clamp to window
    x = Math.max(0, Math.min(winBounds.width - viewBounds.width, x))
    y = Math.max(0, Math.min(winBounds.height - viewBounds.height, y))

    // Convert to ints
    x = Math.floor(x)
    y = Math.floor(y)

    debug(`updatePosition`, { x, y })

    this.browserView.setBounds({
      ...this.browserView.getBounds(),
      x,
      y,
    })
  }

  private updatePreferredSize = (event: Electron.Event, size: Electron.Size) => {
    if (!this.browserView || !this.browserWindow) return

    const windowWidth = this.browserWindow.getSize()[0]

    this.browserView?.setBounds({
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
