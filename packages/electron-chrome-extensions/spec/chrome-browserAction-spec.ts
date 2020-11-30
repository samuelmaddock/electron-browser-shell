import { expect } from 'chai'
import { ipcMain, session, BrowserWindow, app } from 'electron'
import * as http from 'http'
import { AddressInfo } from 'net'
import * as path from 'path'
import { closeAllWindows } from './window-helpers'
import { emittedOnce } from './events-helpers'

import { Extensions } from '../dist'

const fixtures = path.join(__dirname, 'fixtures')

describe('chrome.browserAction', () => {
  const emptyPage = '<script>console.log("loaded")</script>'

  // NB. extensions are only allowed on http://, https:// and ftp:// (!) urls by default.
  let server: http.Server
  let url: string
  before(async () => {
    server = http.createServer((req, res) => {
      res.end(emptyPage)
    })
    await new Promise((resolve) =>
      server.listen(0, '127.0.0.1', () => {
        url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
        resolve()
      })
    )
  })
  after(() => {
    server.close()
  })

  afterEach(closeAllWindows)
  afterEach(() => {
    session.defaultSession.getAllExtensions().forEach((e: any) => {
      session.defaultSession.removeExtension(e.id)
    })
  })

  let w: Electron.BrowserWindow
  let extensions: Extensions
  let customSession: Electron.Session
  let browserActionExt: Electron.Extension

  beforeEach(async () => {
    customSession = session.fromPartition(`persist:${require('uuid').v4()}`)
    browserActionExt = await customSession.loadExtension(
      path.join(fixtures, 'chrome-browserAction')
    )

    extensions = new Extensions({ session: customSession })

    // TODO: remove when using Electron v12
    extensions.addExtension(browserActionExt)

    w = new BrowserWindow({
      show: false,
      webPreferences: { session: customSession, nodeIntegration: true },
    })

    extensions.addTab(w.webContents, w)

    await w.loadURL(url)
  })

  describe('popup', () => {
    it('opens when the browser action is clicked', async () => {
      const popupPromise = emittedOnce(extensions, 'browser-action-popup-created')
      // TODO: use preload script with `injectBrowserAction()`
      await w.webContents.executeJavaScript(
        `require('electron').ipcRenderer.invoke('CHROME_EXT', 'browserAction.activate', '${browserActionExt.id}')`
      )
      const [popup] = await popupPromise
      expect(popup.extensionId).to.equal(browserActionExt.id)
    })
  })
})
