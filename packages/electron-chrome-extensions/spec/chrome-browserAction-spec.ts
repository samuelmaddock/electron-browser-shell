import * as path from 'path'
import { expect } from 'chai'
import { BrowserView, Extension, ipcMain, session, WebContents } from 'electron'

import { emittedOnce } from './events-helpers'
import { uuid } from './spec-helpers'
import { useExtensionBrowser, useServer } from './hooks'
import { createCrxRemoteWindow } from './crx-helpers'

describe('chrome.browserAction', () => {
  const server = useServer()

  const defaultAnchorRect = {
    x: 0,
    y: 0,
    width: 16,
    height: 16,
  }

  const activateExtension = async (
    partition: string,
    webContents: WebContents,
    extension: Extension,
    tabId: number = -1
  ) => {
    const details = {
      eventType: 'click',
      extensionId: extension.id,
      tabId,
      anchorRect: defaultAnchorRect,
    }

    const js = `browserAction.activate('${partition}', ${JSON.stringify(details)})`
    await webContents.executeJavaScript(js)
  }

  describe('messaging', () => {
    const browser = useExtensionBrowser({
      url: server.getUrl,
      extensionName: 'chrome-browserAction-click',
    })

    it('supports cross-session communication', async () => {
      const otherSession = session.fromPartition(`persist:crx-${uuid()}`)
      otherSession.setPreloads(browser.session.getPreloads())

      const view = new BrowserView({
        webPreferences: { session: otherSession, nodeIntegration: false, contextIsolation: true },
      })
      await view.webContents.loadURL(server.getUrl())
      browser.window.addBrowserView(view)
      await activateExtension(browser.partition, view.webContents, browser.extension)
    })

    it('can request action for specific tab', async () => {
      const tab = browser.window.webContents
      await activateExtension(browser.partition, tab, browser.extension, tab.id)
    })

    it('throws for unknown tab', async () => {
      const tab = browser.window.webContents
      const unknownTabId = 99999
      let caught = false
      try {
        await activateExtension(browser.partition, tab, browser.extension, unknownTabId)
      } catch {
        caught = true
      }
      expect(caught).to.be.true
    })
  })

  describe('onClicked', () => {
    const browser = useExtensionBrowser({
      url: server.getUrl,
      extensionName: 'chrome-browserAction-click',
    })

    it('fires listeners when activated', async () => {
      const tabPromise = emittedOnce(ipcMain, 'success')
      await activateExtension(browser.partition, browser.window.webContents, browser.extension)
      const [_, tabDetails] = await tabPromise
      expect(tabDetails).to.be.an('object')
      expect(tabDetails.id).to.equal(browser.window.webContents.id)
    })
  })

  describe('popup', () => {
    const browser = useExtensionBrowser({
      url: server.getUrl,
      extensionName: 'chrome-browserAction-popup',
    })

    it('opens when the browser action is clicked', async () => {
      const popupPromise = emittedOnce(browser.extensions, 'browser-action-popup-created')
      await activateExtension(browser.partition, browser.window.webContents, browser.extension)
      const [popup] = await popupPromise
      expect(popup.extensionId).to.equal(browser.extension.id)
    })

    it('opens when BrowserView is the active tab', async () => {
      const view = new BrowserView({
        webPreferences: {
          session: browser.session,
          nodeIntegration: false,
          contextIsolation: true,
        },
      })
      await view.webContents.loadURL(server.getUrl())
      browser.window.addBrowserView(view)
      browser.extensions.addTab(view.webContents, browser.window)
      browser.extensions.selectTab(view.webContents)

      const popupPromise = emittedOnce(browser.extensions, 'browser-action-popup-created')
      await activateExtension(browser.partition, browser.window.webContents, browser.extension)
      const [popup] = await popupPromise
      expect(popup.extensionId).to.equal(browser.extension.id)
    })
  })

  describe('details', () => {
    const browser = useExtensionBrowser({
      url: server.getUrl,
      extensionName: 'rpc',
    })

    const props = [
      { method: 'BadgeBackgroundColor', detail: 'color', value: '#cacaca' },
      { method: 'BadgeText', detail: 'text' },
      { method: 'Popup', detail: 'popup' },
      { method: 'Title', detail: 'title' },
    ]

    for (const { method, detail, value } of props) {
      it(`sets and gets '${detail}'`, async () => {
        const newValue = value || uuid()
        await browser.crx.exec(`browserAction.set${method}`, { [detail]: newValue })
        const result = await browser.crx.exec(`browserAction.get${method}`)
        expect(result).to.equal(newValue)
      })

      it(`restores initial values for '${detail}'`, async () => {
        const newValue = value || uuid()
        const initial = await browser.crx.exec(`browserAction.get${method}`)
        await browser.crx.exec(`browserAction.set${method}`, { [detail]: newValue })
        await browser.crx.exec(`browserAction.set${method}`, { [detail]: null })
        const result = await browser.crx.exec(`browserAction.get${method}`)
        expect(result).to.equal(initial)
      })
    }

    it('uses custom popup when opening browser action', async () => {
      const popupUuid = uuid()
      const popupPath = `popup.html?${popupUuid}`
      await browser.crx.exec('browserAction.setPopup', { popup: popupPath })
      const popupPromise = emittedOnce(browser.extensions, 'browser-action-popup-created')
      await activateExtension(browser.partition, browser.window.webContents, browser.extension)
      const [popup] = await popupPromise
      await popup.whenReady()
      expect(popup.browserWindow.webContents.getURL()).to.equal(
        `chrome-extension://${browser.extension.id}/${popupPath}`
      )
    })
  })

  describe('<browser-action-list> element', () => {
    const basePath = path.join(__dirname, 'fixtures/browser-action-list')

    const browser = useExtensionBrowser({
      extensionName: 'chrome-browserAction-popup',
    })

    it('lists actions', async () => {
      await browser.webContents.loadFile(path.join(basePath, 'default.html'))

      const extensionIds = await browser.webContents.executeJavaScript(
        `(${() => {
          const list = document.querySelector('browser-action-list')!
          const actions = list.shadowRoot!.querySelectorAll('.action')
          const ids = Array.from(actions).map((elem) => elem.id)
          return ids
        }})();`
      )

      expect(extensionIds).to.deep.equal([browser.extension.id])
    })

    it('lists actions in remote partition', async () => {
      const remoteWindow = createCrxRemoteWindow()
      const remoteTab = remoteWindow.webContents

      await remoteTab.loadURL(server.getUrl())

      // Add <browser-action-list> for remote partition.
      await remoteTab.executeJavaScript(
        `(${(partition: string) => {
          const list = document.createElement('browser-action-list')
          list.setAttribute('partition', partition)
          document.body.appendChild(list)
        }})('${browser.partition}');`
      )

      const extensionIds = await remoteTab.executeJavaScript(
        `(${() => {
          const list = document.querySelector('browser-action-list')!
          const actions = list.shadowRoot!.querySelectorAll('.action')
          const ids = Array.from(actions).map((elem) => elem.id)
          return ids
        }})();`
      )

      expect(extensionIds).to.deep.equal([browser.extension.id])
    })
  })
})
