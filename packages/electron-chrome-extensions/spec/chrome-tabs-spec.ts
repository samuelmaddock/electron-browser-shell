import { expect } from 'chai'
import { ipcMain, session, BrowserWindow, app } from 'electron'
import * as http from 'http'
import { AddressInfo } from 'net'
import * as path from 'path'
import { closeAllWindows } from './window-helpers'
import { emittedOnce } from './events-helpers'

import { Extensions } from '../dist'

const fixtures = path.join(__dirname, 'fixtures')

describe('chrome.tabs', () => {
  const emptyPage = '<script>console.log("loaded")</script>'

  const DEBUG = false
  if (DEBUG) {
    app.on('web-contents-created', (event, wc) => {
      if (wc.getType() === 'backgroundPage') {
        wc.on('console-message', (ev, ...args) => {
          console.log('***bg msg', args)
        })
      }
    })
  }

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

  beforeEach(async () => {
    const customSession = session.fromPartition(`persist:${require('uuid').v4()}`)
    await customSession.loadExtension(path.join(fixtures, 'chrome-tabs'))

    extensions = new Extensions({ session: customSession })

    w = new BrowserWindow({
      show: false,
      webPreferences: { session: customSession, nodeIntegration: true },
    })

    extensions.addTab(w.webContents)

    await w.loadURL(url)
  })

  const exec = async (method: string, ...args: any[]) => {
    const p = emittedOnce(ipcMain, 'success')
    await w.webContents.executeJavaScript(`exec('${JSON.stringify({ method, args })}')`)
    const [, result] = await p
    return result
  }

  it('get', async () => {
    const tabId = w.webContents.id
    const result = await exec('get', tabId)
    expect(result).to.be.an('object')
    expect(result.id).to.equal(tabId)
  })

  it('update', async () => {
    const tabId = w.webContents.id
    const updateUrl = `${url}/foo`
    const navigatePromise = emittedOnce(w.webContents, 'did-navigate')
    exec('update', tabId, { url: updateUrl })
    await navigatePromise
    expect(w.webContents.getURL()).to.equal(updateUrl)
  })
})
