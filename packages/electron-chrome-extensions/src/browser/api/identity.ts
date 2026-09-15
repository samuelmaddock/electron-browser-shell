import { BrowserWindow } from 'electron'
import { ExtensionContext } from '../context'
import { ExtensionEvent } from '../router'
import debug from 'debug'

const d = debug('electron-chrome-extensions:identity')

interface WebAuthFlowDetails {
  url: string
  interactive?: boolean
}

export class IdentityAPI {
  constructor(private ctx: ExtensionContext) {
    const handle = this.ctx.router.apiHandler()
    handle('identity.launchWebAuthFlow', this.launchWebAuthFlow.bind(this), {
      permission: 'identity',
    })
  }

  private launchWebAuthFlow = (
    event: ExtensionEvent,
    details: WebAuthFlowDetails,
  ): Promise<string | undefined> => {
    const extensionId = event.extension.id
    const redirectBase = `https://${extensionId}.chromiumapp.org`

    d(`launchWebAuthFlow [ext:${extensionId}, interactive:${details.interactive}]`)

    return new Promise<string | undefined>((resolve, reject) => {
      let settled = false

      const win = new BrowserWindow({
        show: details.interactive !== false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      })

      const settle = (result: string | undefined | Error) => {
        if (settled) return
        settled = true
        if (!win.isDestroyed()) win.destroy()
        if (result instanceof Error) {
          reject(result)
        } else {
          resolve(result)
        }
      }

      const checkUrl = (url: string): boolean => {
        if (url.startsWith(redirectBase)) {
          d(`captured redirect URL: ${url}`)
          settle(url)
          return true
        }
        return false
      }

      win.webContents.on('will-navigate', (e, url) => {
        if (checkUrl(url)) e.preventDefault()
      })

      win.webContents.on('will-redirect', (e, url) => {
        if (checkUrl(url)) e.preventDefault()
      })

      win.on('closed', () => {
        settle(new Error('User closed the auth window'))
      })

      win.webContents.loadURL(details.url).catch(settle)
    })
  }
}
