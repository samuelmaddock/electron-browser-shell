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

  /** Preferred size changes are only received in Electron v12+ */
  private usingPreferredSize = false

  private readyPromise: Promise<void>

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
      resizable: false,
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
          enablePreferredSizeMode: true,
        } as any),
      },
    })

    const untypedWebContents = this.browserWindow.webContents as any
    untypedWebContents.on('preferred-size-changed', this.updatePreferredSize)

    this.browserWindow.webContents.on('devtools-closed', this.maybeClose)
    this.browserWindow.on('blur', this.maybeClose)
    this.browserWindow.on('closed', this.destroy)
    this.parent.once('closed', this.destroy)

    this.readyPromise = this.load(opts.url)
  }

  private async load(url: string): Promise<void> {
    const win = this.browserWindow!

    try {
      await win.webContents.loadURL(url)
    } catch (e) {
      console.error(e)
    }

    if (this.destroyed) return

    if (!this.usingPreferredSize) {
      // Set large initial size to avoid overflow
      this.setSize({ width: PopupView.BOUNDS.maxWidth, height: PopupView.BOUNDS.maxHeight })

      // Wait for content and layout to load
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (this.destroyed) return

      await this.queryPreferredSize()
      if (this.destroyed) return
    }

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

  /** Resolves when the popup finishes loading. */
  whenReady() {
    return this.readyPromise
  }

  setSize(rect: Partial<Electron.Rectangle>) {
    if (!this.browserWindow || !this.parent) return

    const width = Math.floor(
      Math.min(PopupView.BOUNDS.maxWidth, Math.max(rect.width || 0, PopupView.BOUNDS.minWidth))
    )

    const height = Math.floor(
      Math.min(PopupView.BOUNDS.maxHeight, Math.max(rect.height || 0, PopupView.BOUNDS.minHeight))
    )

    debug(`setSize`, { width, height })

    this.browserWindow?.setBounds({
      ...this.browserWindow.getBounds(),
      width,
      height,
    })
  }

  private maybeClose = () => {
    // Keep open if webContents is being inspected
    if (!this.browserWindow?.isDestroyed() && this.browserWindow?.webContents.isDevToolsOpened()) {
      debug('preventing close due to DevTools being open')
      return
    }

    // For extension popups with a login form, the user may need to access a
    // program outside of the app. Closing the popup would then add
    // inconvenience.
    if (!BrowserWindow.getFocusedWindow()) {
      debug('preventing close due to focus residing outside of the app')
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

  /** Backwards compat for Electron <12 */
  private async queryPreferredSize() {
    if (this.usingPreferredSize || this.destroyed) return

    const rect = await this.browserWindow!.webContents.executeJavaScript(
      `((${() => {
        const rect = document.body.getBoundingClientRect()
        return { width: rect.width, height: rect.height }
      }})())`
    )

    if (this.destroyed) return

    this.setSize({ width: rect.width, height: rect.height })
    this.updatePosition()
  }

  private updatePreferredSize = (event: Electron.Event, size: Electron.Size) => {
    debug('updatePreferredSize', size)
    this.usingPreferredSize = true
    this.setSize(size)
    this.updatePosition()
  }
}
