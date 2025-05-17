import { ipcMain, BrowserWindow, app, Extension, webContents } from 'electron'
import * as http from 'http'
import * as path from 'node:path'
import { AddressInfo } from 'net'
import { ElectronChromeExtensions } from '../'
import { emittedOnce } from './events-helpers'
import { addCrxPreload, createCrxSession, waitForBackgroundScriptEvaluated } from './crx-helpers'
import { ChromeExtensionImpl } from '../dist/types/browser/impl'

export const useServer = () => {
  const emptyPage = `<!DOCTYPE html>
<html>
  <head>
    <title>title</title>
  </head>
  <body>
  <script>console.log("loaded")</script>
  </body>
</html>`

  // NB. extensions are only allowed on http://, https:// and ftp:// (!) urls by default.
  let server: http.Server
  let url: string

  before(async () => {
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(emptyPage)
    })
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', () => {
        url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
        resolve()
      }),
    )
  })
  after(() => {
    server.close()
  })

  return {
    getUrl: () => url,
  }
}

const fixtures = path.join(__dirname, 'fixtures')

export const useExtensionBrowser = (opts: {
  url?: () => string
  file?: string
  extensionName: string
  openDevTools?: boolean
  assignTabDetails?: ChromeExtensionImpl['assignTabDetails']
}) => {
  let w: Electron.BrowserWindow
  let extensions: ElectronChromeExtensions
  let extension: Extension
  let partition: string
  let customSession: Electron.Session

  beforeEach(async () => {
    const sessionDetails = createCrxSession()

    partition = sessionDetails.partition
    customSession = sessionDetails.session

    addCrxPreload(customSession)

    extensions = new ElectronChromeExtensions({
      license: 'internal-license-do-not-use' as any,
      session: customSession,
      async createTab(details) {
        const tab = (webContents as any).create({ sandbox: true })
        if (details.url) await tab.loadURL(details.url)
        return [tab, w!]
      },
      assignTabDetails(details, tab) {
        opts.assignTabDetails?.(details, tab)
      },
    })

    extension = await customSession.loadExtension(path.join(fixtures, opts.extensionName))
    await waitForBackgroundScriptEvaluated(extension, customSession)

    w = new BrowserWindow({
      show: false,
      webPreferences: { session: customSession, nodeIntegration: false, contextIsolation: true },
    })

    if (opts.openDevTools) {
      w.webContents.openDevTools({ mode: 'detach' })
    }

    extensions.addTab(w.webContents, w)

    if (opts.file) {
      await w.loadFile(opts.file)
    } else if (opts.url) {
      await w.loadURL(opts.url())
    }
  })

  afterEach(() => {
    if (!w.isDestroyed()) {
      if (w.webContents.isDevToolsOpened()) {
        w.webContents.closeDevTools()
      }

      w.destroy()
    }
  })

  return {
    get window() {
      return w
    },
    get webContents() {
      return w.webContents
    },
    get extensions() {
      return extensions
    },
    get extension() {
      return extension
    },
    get session() {
      return customSession
    },
    get partition() {
      return partition
    },

    crx: {
      async exec(method: string, ...args: any[]) {
        const p = emittedOnce(ipcMain, 'success')
        const rpcStr = JSON.stringify({ type: 'api', method, args })
        const safeRpcStr = rpcStr.replace(/'/g, "\\'")
        const js = `exec('${safeRpcStr}')`
        await w.webContents.executeJavaScript(js)
        const [, result] = await p
        return result
      },

      async eventOnce(eventName: string) {
        const p = emittedOnce(ipcMain, 'success')
        await w.webContents.executeJavaScript(
          `exec('${JSON.stringify({ type: 'event-once', name: eventName })}')`,
        )
        const [, results] = await p

        if (typeof results === 'string') {
          throw new Error(results)
        }

        return results
      },
    },
  }
}

export const useBackgroundPageLogging = () => {
  app.on('web-contents-created', (event, wc) => {
    if (wc.getType() === 'backgroundPage') {
      wc.on('console-message', (ev, level, message, line, sourceId) => {
        console.log(`(${sourceId}) ${message}`)
      })
    }
  })
}
