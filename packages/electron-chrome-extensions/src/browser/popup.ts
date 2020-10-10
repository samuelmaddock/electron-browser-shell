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
  private view?: BrowserView

  constructor(public extensionId: string, private window: BrowserWindow, url: string) {
    this.view = new BrowserView({
      webPreferences: {
        contextIsolation: true,
        preferredSizeMode: true,
      } as any,
    })

    // Set default size where preferredSizeMode isn't supported
    this.view.setBounds({ x: this.window.getSize()[0] - 256, y: 62, width: 256, height: 400 })

    const untypedWebContents = this.view.webContents as any
    untypedWebContents.on('preferred-size-changed', this.updatePreferredSize)

    this.view.setBackgroundColor('#ff0000')
    this.view.webContents.loadURL(url)

    // this.view.webContents.openDevTools({ mode: 'detach', activate: true })

    this.window.addBrowserView(this.view)
    this.view.webContents.focus()

    // TODO:
    this.view.webContents.once('blur' as any, this.destroy)
  }

  destroy = () => {
    if (!this.view) return

    this.window.removeBrowserView(this.view)
    if (this.view.webContents.isDevToolsOpened()) {
      this.view.webContents.closeDevTools()
    }

    this.view = undefined
  }

  isDestroyed() {
    return !this.view
  }

  private updatePreferredSize = (event: Electron.Event, size: Electron.Size) => {
    const windowWidth = this.window.getSize()[0]
    this.view?.setBounds({
      x: windowWidth - size.width,
      y: PopupGeometry.OffsetY,
      width: Math.min(PopupGeometry.MaxWidth, Math.max(size.width, PopupGeometry.MinWidth)),
      height: Math.min(PopupGeometry.MaxHeight, Math.max(size.height, PopupGeometry.MinHeight)),
    })
  }
}
