import { expect } from 'chai'

import { useExtensionBrowser, useServer } from './hooks'
import { uuid } from './spec-helpers'

describe('chrome.contextMenus', () => {
  const server = useServer()
  const browser = useExtensionBrowser({ url: server.getUrl, extensionName: 'rpc' })

  const getContextMenuItems = async () => {
    const promise = new Promise<Electron.MenuItem[]>((resolve) => {
      browser.webContents.once('context-menu', (_, params) => {
        const items = browser.extensions.getContextMenuItems(browser.webContents, params)
        resolve(items)
      })
    })

    // Simulate right-click to create context-menu event.
    const opts = { x: 0, y: 0, button: 'right' as any }
    browser.webContents.sendInputEvent({ ...opts, type: 'mouseDown' })
    browser.webContents.sendInputEvent({ ...opts, type: 'mouseUp' })

    return await promise
  }

  describe('create()', () => {
    it('creates item with label', async () => {
      const id = uuid()
      const title = 'ヤッホー'
      await browser.exec('contextMenus.create', { id, title })
      const items = await getContextMenuItems()
      expect(items).to.have.lengthOf(1)
      expect(items[0].id).to.equal(id)
      expect(items[0].label).to.equal(title)
    })

    it('creates a child item', async () => {
      const parentId = uuid()
      const id = uuid()
      await browser.exec('contextMenus.create', { id: parentId, title: 'parent' })
      await browser.exec('contextMenus.create', { id, parentId, title: 'child' })
      const items = await getContextMenuItems()
      expect(items).to.have.lengthOf(1)
      expect(items[0].label).to.equal('parent')
      expect(items[0].submenu).to.exist
      expect(items[0].submenu!.items).to.have.lengthOf(1)
      expect(items[0].submenu!.items[0].label).to.equal('child')
    })
  })

  describe('remove()', () => {
    it('removes item', async () => {
      const id = uuid()
      await browser.exec('contextMenus.create', { id })
      await browser.exec('contextMenus.remove', id)
      const items = await getContextMenuItems()
      expect(items).to.be.empty
    })
  })

  describe('removeAll()', () => {
    it('removes all items', async () => {
      await browser.exec('contextMenus.create', {})
      await browser.exec('contextMenus.create', {})
      await browser.exec('contextMenus.removeAll')
      const items = await getContextMenuItems()
      expect(items).to.be.empty
    })
  })
})
