import { BrowserView, BrowserWindow } from 'electron'

enum PopupGeometry {
  // TODO: dynamically set offset based on action button position
  OffsetY = 62,
  MinWidth = 25,
  MinHeight = 25,
  MaxWidth = 800,
  MaxHeight = 600,
}

export class PopupView {
  browserView?: BrowserView
  browserWindow?: BrowserWindow

  private destroyed: boolean = false

  constructor(public extensionId: string, browserWindow: BrowserWindow, url: string) {
    this.browserWindow = browserWindow

    this.browserView = new BrowserView({
      webPreferences: {
        contextIsolation: true,
        preferredSizeMode: true,
      } as any,
    })

    const untypedWebContents = this.browserView.webContents as any
    untypedWebContents.on('preferred-size-changed', this.updatePreferredSize)

    this.browserView.setBackgroundColor('#ff0000')
    this.browserView.webContents.loadURL(url)

    this.browserWindow.addBrowserView(this.browserView)
    this.browserView.webContents.focus()

    // Set default size where preferredSizeMode isn't supported
    this.browserView.setBounds({
      x: this.browserWindow.getSize()[0] - 256,
      y: 62,
      width: 256,
      height: 400,
    })

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

  private updatePreferredSize = (event: Electron.Event, size: Electron.Size) => {
    const windowWidth = this.browserWindow!.getSize()[0]
    this.browserView?.setBounds({
      x: windowWidth - size.width,
      y: PopupGeometry.OffsetY,
      width: Math.min(PopupGeometry.MaxWidth, Math.max(size.width, PopupGeometry.MinWidth)),
      height: Math.min(PopupGeometry.MaxHeight, Math.max(size.height, PopupGeometry.MinHeight)),
    })
  }
}
