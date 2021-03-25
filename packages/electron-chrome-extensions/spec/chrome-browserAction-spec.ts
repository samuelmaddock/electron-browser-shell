import { expect } from 'chai'
import { BrowserView, Extension, ipcMain, session, WebContents } from 'electron'

import { emittedOnce } from './events-helpers'
import { uuid } from './spec-helpers'
import { useExtensionBrowser, useServer } from './hooks'

describe('chrome.browserAction', () => {
  const server = useServer()

  const activateExtension = async (
    partition: string,
    webContents: WebContents,
    extension: Extension,
    tabId: number = -1
  ) => {
    // TODO: use preload script with `injectBrowserAction()`
    await webContents.executeJavaScript(
      `require('electron').ipcRenderer.invoke('CHROME_EXT_REMOTE', '${partition}', 'browserAction.activate', '${extension.id}', ${tabId})`
    )
  }

  describe('messaging', () => {
    const browser = useExtensionBrowser({
      url: server.getUrl,
      extensionName: 'chrome-browserAction-click',
    })

    it('supports cross-session communication', async () => {
      const otherSession = session.fromPartition(`persist:${uuid()}`)
      const view = new BrowserView({
        webPreferences: { session: otherSession, nodeIntegration: true },
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
      const p = activateExtension(
        browser.partition,
        browser.window.webContents,
        browser.extension,
        99999
      )
      await expect(p).rejectedWith(/^Error invoking remote method/)
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
      const view = new BrowserView({ webPreferences: { session: browser.session } })
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
        await browser.exec(`browserAction.set${method}`, { [detail]: newValue })
        const result = await browser.exec(`browserAction.get${method}`)
        expect(result).to.equal(newValue)
      })

      it(`restores initial values for '${detail}'`, async () => {
        const newValue = value || uuid()
        const initial = await browser.exec(`browserAction.get${method}`)
        await browser.exec(`browserAction.set${method}`, { [detail]: newValue })
        await browser.exec(`browserAction.set${method}`, { [detail]: null })
        const result = await browser.exec(`browserAction.get${method}`)
        expect(result).to.equal(initial)
      })
    }
  })
})
