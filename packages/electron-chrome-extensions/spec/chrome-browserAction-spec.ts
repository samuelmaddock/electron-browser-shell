import { expect } from 'chai'
import { BrowserView, Extension, ipcMain, WebContents } from 'electron'
import { emittedOnce } from './events-helpers'

import { useBackgroundPageLogging, useExtensionBrowser, useServer } from './hooks'

describe('chrome.browserAction', () => {
  const server = useServer()

  const activateExtension = async (webContents: WebContents, extension: Extension) => {
    // TODO: use preload script with `injectBrowserAction()`
    await webContents.executeJavaScript(
      `require('electron').ipcRenderer.invoke('CHROME_EXT', 'browserAction.activate', '${extension.id}')`
    )
  }

  describe('onClicked', () => {
    const browser = useExtensionBrowser({
      url: server.getUrl,
      extensionName: 'chrome-browserAction-click',
    })

    it('fires listeners when activated', async () => {
      const tabPromise = emittedOnce(ipcMain, 'success')
      await activateExtension(browser.window.webContents, browser.extension)
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
      await activateExtension(browser.window.webContents, browser.extension)
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
      await activateExtension(browser.window.webContents, browser.extension)
      const [popup] = await popupPromise
      expect(popup.extensionId).to.equal(browser.extension.id)
    })
  })
})
