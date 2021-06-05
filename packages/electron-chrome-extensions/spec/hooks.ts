import { ipcMain, session, BrowserWindow, app, Extension } from 'electron'
import * as http from 'http'
import * as path from 'path'
import { AddressInfo } from 'net'
import { ElectronChromeExtensions } from '../dist'
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
  let extensions: ElectronChromeExtensions
  let extension: Extension
  let partitionName: string
  let partition: string
  let customSession: Electron.Session

  beforeEach(async () => {
    partitionName = `crx-${uuid()}`
    partition = `persist:${partitionName}`
    customSession = session.fromPartition(partition)
    extensions = new ElectronChromeExtensions({ session: customSession })

    extension = await customSession.loadExtension(path.join(fixtures, opts.extensionName))

    w = new BrowserWindow({
      show: false,
      webPreferences: { session: customSession, nodeIntegration: true, contextIsolation: false },
    })

    extensions.addTab(w.webContents, w)

    await w.loadURL(opts.url())
  })

  afterEach(() => {
    if (!w.isDestroyed()) {
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
      wc.on('console-message', (ev, level, message, line, sourceId) => {
        console.log(`(${sourceId}) ${message}`)
      })
    }
  })
}
