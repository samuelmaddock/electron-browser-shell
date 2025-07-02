import { EventEmitter } from 'node:events'
import { BrowserWindow, Session } from 'electron'
import { getAllWindows } from './api/common'
import debug from 'debug'

const d = debug('electron-chrome-extensions:popup')

export interface PopupAnchorRect {
  x: number
  y: number
  width: number
  height: number
}

interface PopupViewOptions {
  extensionId: string
  session: Session
  parent: Electron.BaseWindow
  url: string
  anchorRect: PopupAnchorRect
  alignment?: string
}

const supportsPreferredSize = () => {
  const major = parseInt(process.versions.electron.split('.').shift() || '', 10)
  return major >= 12
}

export class PopupView extends EventEmitter {
  static POSITION_PADDING = 5

  static BOUNDS = {
    minWidth: 25,
    minHeight: 25,
    maxWidth: 800,
    maxHeight: 600,
  }

  browserWindow?: BrowserWindow
  parent?: Electron.BaseWindow
  extensionId: string

  private anchorRect: PopupAnchorRect
  private destroyed: boolean = false
  private hidden: boolean = true
  private alignment?: string

  /** Preferred size changes are only received in Electron v12+ */
  private usingPreferredSize = supportsPreferredSize()

  private readyPromise: Promise<void>

  constructor(opts: PopupViewOptions) {
    super()

    this.parent = opts.parent
    this.extensionId = opts.extensionId
    this.anchorRect = opts.anchorRect
    this.alignment = opts.alignment

    this.browserWindow = new BrowserWindow({
      show: false,
      frame: false,
      parent: opts.parent,
      movable: false,
      maximizable: false,
      minimizable: false,
      // https://github.com/electron/electron/issues/47579
      fullscreenable: false,
      resizable: false,
      skipTaskbar: true,
      backgroundColor: '#ffffff',
      roundedCorners: false,
      webPreferences: {
        session: opts.session,
        sandbox: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        contextIsolation: true,
        enablePreferredSizeMode: true,
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

  private show() {
    this.hidden = false
    this.browserWindow?.show()
  }

  private async load(url: string): Promise<void> {
    const win = this.browserWindow!

    try {
      await win.webContents.loadURL(url)
    } catch (e) {
      console.error(e)
    }

    if (this.destroyed) return

    if (this.usingPreferredSize) {
      // Set small initial size so the preferred size grows to what's needed
      this.setSize({ width: PopupView.BOUNDS.minWidth, height: PopupView.BOUNDS.minHeight })
    } else {
      // Set large initial size to avoid overflow
      this.setSize({ width: PopupView.BOUNDS.maxWidth, height: PopupView.BOUNDS.maxHeight })

      // Wait for content and layout to load
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (this.destroyed) return

      await this.queryPreferredSize()
      if (this.destroyed) return

      this.show()
    }
  }

  destroy = () => {
    if (this.destroyed) return

    this.destroyed = true

    d(`destroying ${this.extensionId}`)

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
      Math.min(PopupView.BOUNDS.maxWidth, Math.max(rect.width || 0, PopupView.BOUNDS.minWidth)),
    )

    const height = Math.floor(
      Math.min(PopupView.BOUNDS.maxHeight, Math.max(rect.height || 0, PopupView.BOUNDS.minHeight)),
    )

    const size = { width, height }
    d(`setSize`, size)

    this.emit('will-resize', size)

    this.browserWindow?.setBounds({
      ...this.browserWindow.getBounds(),
      ...size,
    })

    this.emit('resized')
  }

  private maybeClose = () => {
    // Keep open if webContents is being inspected
    if (!this.browserWindow?.isDestroyed() && this.browserWindow?.webContents.isDevToolsOpened()) {
      d('preventing close due to DevTools being open')
      return
    }

    // For extension popups with a login form, the user may need to access a
    // program outside of the app. Closing the popup would then add
    // inconvenience.
    if (!getAllWindows().some((win) => win.isFocused())) {
      d('preventing close due to focus residing outside of the app')
      return
    }

    this.destroy()
  }

  private updatePosition() {
    if (!this.browserWindow || !this.parent) return

    const winBounds = this.parent.getBounds()
    const winContentBounds = this.parent.getContentBounds()
    const nativeTitlebarHeight = winBounds.height - winContentBounds.height

    const viewBounds = this.browserWindow.getBounds()

    let x = winBounds.x + this.anchorRect.x + this.anchorRect.width - viewBounds.width
    let y =
      winBounds.y +
      nativeTitlebarHeight +
      this.anchorRect.y +
      this.anchorRect.height +
      PopupView.POSITION_PADDING

    // If aligned to a differently then we need to offset the popup position
    if (this.alignment?.includes('right')) x = winBounds.x + this.anchorRect.x
    if (this.alignment?.includes('top'))
      y =
        winBounds.y +
        nativeTitlebarHeight -
        viewBounds.height +
        this.anchorRect.y -
        PopupView.POSITION_PADDING

    // Convert to ints
    x = Math.floor(x)
    y = Math.floor(y)

    const position = { x, y }
    d(`updatePosition`, position)

    this.emit('will-move', position)

    this.browserWindow.setBounds({
      ...this.browserWindow.getBounds(),
      ...position,
    })

    this.emit('moved')
  }

  /** Backwards compat for Electron <12 */
  private async queryPreferredSize() {
    if (this.usingPreferredSize || this.destroyed) return

    const rect = await this.browserWindow!.webContents.executeJavaScript(
      `((${() => {
        const rect = document.body.getBoundingClientRect()
        return { width: rect.width, height: rect.height }
      }})())`,
    )

    if (this.destroyed) return

    this.setSize({ width: rect.width, height: rect.height })
    this.updatePosition()
  }

  private updatePreferredSize = (event: Electron.Event, size: Electron.Size) => {
    d('updatePreferredSize', size)
    this.usingPreferredSize = true
    this.setSize(size)
    this.updatePosition()

    // Wait to reveal popup until it's sized and positioned correctly
    if (this.hidden) this.show()
  }
}
