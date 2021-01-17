import { ipcMain, session, BrowserWindow, app } from 'electron'
import * as http from 'http'
import * as path from 'path'
import { AddressInfo } from 'net'
import { Extensions } from '../dist'
import { emittedOnce } from './events-helpers'
import { uuid } from './spec-helpers'

export const useServer = () => {
  const emptyPage = '<script>console.log("loaded")</script>'

  // NB. extensions are only allowed on http://, https:// and ftp:// (!) urls by default.
  let server: http.Server
  let url: string

  before(async () => {
    server = http.createServer((req, res) => {
      res.end(emptyPage)
    })
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', () => {
        url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
        resolve()
      })
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

export const useExtensionBrowser = (opts: { url: () => string; extensionName: string }) => {
  let w: Electron.BrowserWindow
  let extensions: Extensions
  let customSession: Electron.Session

  beforeEach(async () => {
    customSession = session.fromPartition(`persist:${uuid()}`)
    await customSession.loadExtension(path.join(fixtures, opts.extensionName))

    extensions = new Extensions({ session: customSession })

    w = new BrowserWindow({
      show: false,
      webPreferences: { session: customSession, nodeIntegration: true, contextIsolation: false },
    })

    extensions.addTab(w.webContents, w)

    await w.loadURL(opts.url())
  })

  return {
    get window() {
      return w
    },
    get extensions() {
      return extensions
    },
    get session() {
      return customSession
    },

    async exec(method: string, ...args: any[]) {
      const p = emittedOnce(ipcMain, 'success')
      await w.webContents.executeJavaScript(`exec('${JSON.stringify({ method, args })}')`)
      const [, result] = await p
      return result
    },
  }
}

export const useBackgroundPageLogging = () => {
  app.on('web-contents-created', (event, wc) => {
    if (wc.getType() === 'backgroundPage') {
      wc.on('console-message', (ev, ...args) => {
        console.log('[backgroundPage]', args)
      })
    }
  })
}
