import { expect } from 'chai'
import { ipcMain } from 'electron'
import { once } from 'node:events'

import { useExtensionBrowser, useServer } from './hooks'
import { uuid } from './spec-helpers'

describe('chrome.contextMenus', () => {
  const server = useServer()
  const browser = useExtensionBrowser({
    url: server.getUrl,
    extensionName: 'rpc',
  })

  const getContextMenuItems = async () => {
    // TODO: why is this needed since upgrading to Electron 22?
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const contextMenuPromise = once(browser.webContents, 'context-menu')

    // Simulate right-click to create context-menu event.
    const opts = { x: 0, y: 0, button: 'right' as any }
    browser.webContents.sendInputEvent({ ...opts, type: 'mouseDown' })
    browser.webContents.sendInputEvent({ ...opts, type: 'mouseUp' })

    const [, params] = await contextMenuPromise
    return browser.extensions.getContextMenuItems(browser.webContents, params)
  }

  describe('create()', () => {
    it('creates item with label', async () => {
      const id = uuid()
      const title = 'ヤッホー'
      await browser.crx.exec('contextMenus.create', { id, title })
      const items = await getContextMenuItems()
      expect(items).to.have.lengthOf(1)
      expect(items[0].id).to.equal(id)
      expect(items[0].label).to.equal(title)
    })

    it('creates a child item', async () => {
      const parentId = uuid()
      const id = uuid()
      await browser.crx.exec('contextMenus.create', { id: parentId, title: 'parent' })
      await browser.crx.exec('contextMenus.create', { id, parentId, title: 'child' })
      const items = await getContextMenuItems()
      expect(items).to.have.lengthOf(1)
      expect(items[0].label).to.equal('parent')
      expect(items[0].submenu).to.be.an('object')
      expect(items[0].submenu!.items).to.have.lengthOf(1)
      expect(items[0].submenu!.items[0].label).to.equal('child')
    })

    it('groups multiple top-level items', async () => {
      await browser.crx.exec('contextMenus.create', { id: uuid(), title: 'one' })
      await browser.crx.exec('contextMenus.create', { id: uuid(), title: 'two' })
      const items = await getContextMenuItems()
      expect(items).to.have.lengthOf(1)
      expect(items[0].label).to.equal(browser.extension.name)
      expect(items[0].submenu).to.be.an('object')
      expect(items[0].submenu!.items).to.have.lengthOf(2)
      expect(items[0].submenu!.items[0].label).to.equal('one')
      expect(items[0].submenu!.items[1].label).to.equal('two')
    })

    it('invokes the create callback', async () => {
      const ipcName = 'create-callback'
      await browser.crx.exec('contextMenus.create', {
        title: 'callback',
        onclick: { __IPC_FN__: ipcName },
      })
      const items = await getContextMenuItems()
      const p = once(ipcMain, ipcName)
      items[0].click()
      await p
    })
  })

  describe('remove()', () => {
    it('removes item', async () => {
      const id = uuid()
      await browser.crx.exec('contextMenus.create', { id })
      await browser.crx.exec('contextMenus.remove', id)
      const items = await getContextMenuItems()
      expect(items).to.be.empty
    })
  })

  describe('removeAll()', () => {
    it('removes all items', async () => {
      await browser.crx.exec('contextMenus.create', {})
      await browser.crx.exec('contextMenus.create', {})
      await browser.crx.exec('contextMenus.removeAll')
      const items = await getContextMenuItems()
      expect(items).to.be.empty
    })
  })
})
