import { expect } from 'chai'
import { app, webContents } from 'electron'
import { emittedOnce } from './events-helpers'

import { useExtensionBrowser, useServer } from './hooks'

describe('chrome.windows', () => {
  const server = useServer()
  const browser = useExtensionBrowser({ url: server.getUrl, extensionName: 'rpc' })

  describe('get()', () => {
    it('gets details on the window', async () => {
      const windowId = browser.window.id
      const result = await browser.crx.exec('windows.get', windowId)
      expect(result).to.be.an('object')
      expect(result.id).to.equal(windowId)
    })
  })

  describe('getLastFocused()', () => {
    it('gets the last focused window', async () => {
      // HACK: focus() doesn't actually emit this in tests
      browser.window.emit('focus')
      const windowId = browser.window.id
      const result = await browser.crx.exec('windows.getLastFocused')
      expect(result).to.be.an('object')
      expect(result.id).to.equal(windowId)
    })
  })

  describe('remove()', () => {
    it('removes the window', async () => {
      const windowId = browser.window.id
      const closedPromise = emittedOnce(browser.window, 'closed')
      browser.crx.exec('windows.remove', windowId)
      await closedPromise
    })

    it('removes the current window', async () => {
      const closedPromise = emittedOnce(browser.window, 'closed')
      browser.crx.exec('windows.remove')
      await closedPromise
    })
  })
})
