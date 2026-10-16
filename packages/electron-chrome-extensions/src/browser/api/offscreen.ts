import { BrowserWindow } from 'electron'
import { ExtensionContext } from '../context'
import { ExtensionEvent } from '../router'
import debug from 'debug'

const d = debug('electron-chrome-extensions:offscreen')

interface OffscreenDocument {
  url: string
  window: BrowserWindow
}

/**
 * chrome.offscreen: each extension may have one offscreen document, hosted in
 * a hidden window that loads the extension page.
 *
 * https://developer.chrome.com/docs/extensions/reference/api/offscreen
 */
export class OffscreenAPI {
  private documents = new Map<string, OffscreenDocument>()

  constructor(private ctx: ExtensionContext) {
    const handle = this.ctx.router.apiHandler()
    handle('offscreen.createDocument', this.createDocument, { permission: 'offscreen' })
    handle('offscreen.closeDocument', this.closeDocument, { permission: 'offscreen' })
    handle('offscreen.hasDocument', this.hasDocument, { permission: 'offscreen' })
    handle('runtime.getContexts', this.getContexts)

    const sessionExtensions = ctx.session.extensions || ctx.session
    sessionExtensions.on('extension-unloaded', (_event, extension) => {
      this.destroyDocument(extension.id)
    })
  }

  private createDocument = async (
    { extension }: ExtensionEvent,
    params: chrome.offscreen.CreateParameters,
  ) => {
    if (this.documents.has(extension.id)) {
      throw new Error('Only a single offscreen document may be created.')
    }
    if (!params?.url) throw new Error('offscreen.createDocument requires a url')

    const url = new URL(params.url, extension.url).href
    if (!url.startsWith(extension.url)) {
      throw new Error('Offscreen document url must belong to the extension')
    }

    const window = new BrowserWindow({
      show: false,
      skipTaskbar: true,
      webPreferences: {
        session: this.ctx.session,
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    })
    const doc = { url, window }
    this.documents.set(extension.id, doc)
    window.on('closed', () => {
      if (this.documents.get(extension.id) === doc) this.documents.delete(extension.id)
    })

    d('creating offscreen document %s', url)
    try {
      await window.loadURL(url)
    } catch (error) {
      this.destroyDocument(extension.id)
      throw error
    }
  }

  private closeDocument = ({ extension }: ExtensionEvent) => {
    if (!this.documents.has(extension.id)) {
      throw new Error('No current offscreen document.')
    }
    this.destroyDocument(extension.id)
  }

  private hasDocument = ({ extension }: ExtensionEvent) => this.documents.has(extension.id)

  /** Reports offscreen documents. Other context types are left to the caller. */
  private getContexts = (
    { extension }: ExtensionEvent,
    filter: chrome.runtime.ContextFilter = {},
  ): chrome.runtime.ExtensionContext[] => {
    if (filter.contextTypes && !filter.contextTypes.includes('OFFSCREEN_DOCUMENT' as any)) {
      return []
    }
    const doc = this.documents.get(extension.id)
    if (!doc || doc.window.isDestroyed()) return []
    if (filter.documentUrls && !filter.documentUrls.includes(doc.url)) return []
    if (filter.documentOrigins && !filter.documentOrigins.includes(new URL(doc.url).origin)) {
      return []
    }

    const context = {
      contextType: 'OFFSCREEN_DOCUMENT',
      contextId: `offscreen-${doc.window.webContents.id}`,
      tabId: -1,
      windowId: -1,
      frameId: 0,
      documentId: undefined,
      documentUrl: doc.url,
      documentOrigin: new URL(doc.url).origin,
      incognito: false,
    }
    return [context as unknown as chrome.runtime.ExtensionContext]
  }

  private destroyDocument(extensionId: string) {
    const doc = this.documents.get(extensionId)
    if (!doc) return
    this.documents.delete(extensionId)
    if (!doc.window.isDestroyed()) doc.window.destroy()
  }
}
