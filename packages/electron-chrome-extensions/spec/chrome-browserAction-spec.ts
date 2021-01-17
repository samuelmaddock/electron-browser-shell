import { expect } from 'chai'
import { BrowserView } from 'electron'
import { emittedOnce } from './events-helpers'

import { useExtensionBrowser, useServer } from './hooks'

describe('chrome.browserAction', () => {
  const server = useServer()
  const browser = useExtensionBrowser({ url: server.getUrl, extensionName: 'chrome-browserAction' })

  describe('popup', () => {
    it('opens when the browser action is clicked', async () => {
      const popupPromise = emittedOnce(browser.extensions, 'browser-action-popup-created')
      // TODO: use preload script with `injectBrowserAction()`
      await browser.window.webContents.executeJavaScript(
        `require('electron').ipcRenderer.invoke('CHROME_EXT', 'browserAction.activate', '${browser.extension.id}')`
      )
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
      // TODO: use preload script with `injectBrowserAction()`
      await browser.window.webContents.executeJavaScript(
        `require('electron').ipcRenderer.invoke('CHROME_EXT', 'browserAction.activate', '${browser.extension.id}')`
      )
      const [popup] = await popupPromise
      expect(popup.extensionId).to.equal(browser.extension.id)
    })
  })
})
