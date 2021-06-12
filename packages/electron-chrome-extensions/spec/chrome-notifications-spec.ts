import { expect } from 'chai'

import { useExtensionBrowser, useServer } from './hooks'
import { uuid } from './spec-helpers'

const basicOpts: chrome.notifications.NotificationOptions = {
  type: 'basic',
  title: 'title',
  message: 'message',
  iconUrl: 'icon_16.png',
  silent: true,
}

describe('chrome.notifications', () => {
  const server = useServer()
  const browser = useExtensionBrowser({ url: server.getUrl, extensionName: 'rpc' })

  describe('create()', () => {
    it('creates and shows a basic notification', async () => {
      const notificationId = uuid()
      const result = await browser.crx.exec('notifications.create', notificationId, basicOpts)
      expect(result).to.equal(notificationId)
      await browser.crx.exec('notifications.clear', notificationId)
    })

    it('ignores invalid options', async () => {
      const notificationId = uuid()
      const result = await browser.crx.exec('notifications.create', notificationId, {})
      expect(result).is.null
    })

    it('ignores icons outside of extensions directory', async () => {
      const notificationId = uuid()
      const result = await browser.crx.exec('notifications.create', notificationId, {
        ...basicOpts,
        iconUrl: '../chrome-browserAction/icon_16.png',
      })
      expect(result).is.null
    })

    it('creates a notification with no ID given', async () => {
      const notificationId = await browser.crx.exec('notifications.create', basicOpts)
      expect(notificationId).to.be.string
      await browser.crx.exec('notifications.clear', notificationId)
    })
  })

  describe('getAll()', () => {
    it('lists created notification', async () => {
      const notificationId = uuid()
      await browser.crx.exec('notifications.create', notificationId, basicOpts)
      const list = await browser.crx.exec('notifications.getAll')
      expect(list).to.deep.equal([notificationId])
      await browser.crx.exec('notifications.clear', notificationId)
    })
  })
})
