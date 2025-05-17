import { expect } from 'chai'
import { app, BrowserWindow } from 'electron'
import { emittedOnce } from './events-helpers'

import { useExtensionBrowser, useServer } from './hooks'
import { ChromeExtensionImpl } from '../dist/types/browser/impl'

describe('chrome.tabs', () => {
  let assignTabDetails: ChromeExtensionImpl['assignTabDetails']

  const server = useServer()
  const browser = useExtensionBrowser({
    url: server.getUrl,
    extensionName: 'rpc',
    assignTabDetails(details, tab) {
      assignTabDetails?.(details, tab)
    },
  })

  afterEach(() => {
    assignTabDetails = undefined
  })

  describe('get()', () => {
    it('returns tab details', async () => {
      const tabId = browser.window.webContents.id
      const result = await browser.crx.exec('tabs.get', tabId)
      expect(result).to.be.an('object')
      expect(result.id).to.equal(tabId)
      expect(result.windowId).to.equal(browser.window.id)
    })
  })

  describe('getCurrent()', () => {
    it('gets details of the active tab', async () => {
      const result = await browser.crx.exec('tabs.getCurrent')
      expect(result).to.be.an('object')
    })
  })

  describe('create()', () => {
    it('creates a tab', async () => {
      const wcPromise = emittedOnce(app, 'web-contents-created')
      const tabInfo = await browser.crx.exec('tabs.create', { url: server.getUrl() })
      const [, wc] = await wcPromise
      expect(tabInfo).to.be.an('object')
      expect(tabInfo.id).to.equal(wc.id)
      expect(tabInfo.active).to.equal(true)
      expect(tabInfo.url).to.equal(server.getUrl())
      expect(tabInfo.windowId).to.equal(browser.window.id)
      expect(tabInfo.title).to.be.a('string')
    })

    // TODO: Navigating to chrome-extension:// receives ERR_BLOCKED_BY_CLIENT (-20)
    it.skip('resolves relative URL', async () => {
      const relativeUrl = './options.html'
      const tabInfo = await browser.crx.exec('tabs.create', { url: relativeUrl })
      const url = new URL(relativeUrl, browser.extension.url).href
      expect(tabInfo).to.be.an('object')
      expect(tabInfo.url).to.equal(url)
    })

    it('fails on chrome:// URLs', async () => {
      const tabInfo = await browser.crx.exec('tabs.create', { url: 'chrome://kill' })
      expect(tabInfo).to.be.a('null')
    })

    it('fails on javascript: URLs', async () => {
      const tabInfo = browser.crx.exec('tabs.create', { url: "javascript:alert('hacked')" })
      expect(await tabInfo).to.be.a('null')
    })
  })

  describe('query()', () => {
    it('gets the active tab', async () => {
      const result = await browser.crx.exec('tabs.query', { active: true })
      expect(result).to.be.an('array')
      expect(result).to.be.length(1)
      expect(result[0].id).to.be.equal(browser.window.webContents.id)
      expect(result[0].windowId).to.be.equal(browser.window.id)
    })

    it('gets the active tab of multiple windows', async () => {
      const secondWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          session: browser.session,
          nodeIntegration: false,
          contextIsolation: true,
        },
      })

      browser.extensions.addTab(secondWindow.webContents, secondWindow)

      const result = await browser.crx.exec('tabs.query', { active: true })
      expect(result).to.be.an('array')
      expect(result).to.be.length(2)
      expect(result[0].windowId).to.be.equal(browser.window.id)
      expect(result[1].windowId).to.be.equal(secondWindow.id)
    })

    it('matches exact title', async () => {
      const results = await browser.crx.exec('tabs.query', { title: 'title' })
      expect(results).to.be.an('array')
      expect(results).to.be.length(1)
      expect(results[0].title).to.be.equal('title')
    })

    it('matches title pattern', async () => {
      const results = await browser.crx.exec('tabs.query', { title: '*' })
      expect(results).to.be.an('array')
      expect(results).to.be.length(1)
      expect(results[0].title).to.be.equal('title')
    })

    it('matches exact url', async () => {
      const url = server.getUrl()
      const results = await browser.crx.exec('tabs.query', { url })
      expect(results).to.be.an('array')
      expect(results).to.be.length(1)
      expect(results[0].url).to.be.equal(url)
    })

    it('matches wildcard url pattern', async () => {
      const url = 'http://*/*'
      const results = await browser.crx.exec('tabs.query', { url })
      expect(results).to.be.an('array')
      expect(results).to.be.length(1)
      expect(results[0].url).to.be.equal(server.getUrl())
    })

    it('matches either url pattern', async () => {
      const patterns = ['http://foo.bar/*', `${server.getUrl()}*`]
      const results = await browser.crx.exec('tabs.query', { url: patterns })
      expect(results).to.be.an('array')
      expect(results).to.be.length(1)
      expect(results[0].url).to.be.equal(server.getUrl())
    })
  })

  describe('reload()', () => {
    it('reloads the active tab', async () => {
      const navigatePromise = emittedOnce(browser.window.webContents, 'did-navigate')
      browser.crx.exec('tabs.reload')
      await navigatePromise
    })

    it('reloads a specified tab', async () => {
      const tabId = browser.window.webContents.id
      const navigatePromise = emittedOnce(browser.window.webContents, 'did-navigate')
      browser.crx.exec('tabs.reload', tabId)
      await navigatePromise
    })
  })

  describe('update()', () => {
    it('navigates the tab', async () => {
      const tabId = browser.window.webContents.id
      const updateUrl = `${server.getUrl()}foo`
      const navigatePromise = emittedOnce(browser.window.webContents, 'did-navigate')
      browser.crx.exec('tabs.update', tabId, { url: updateUrl })
      await navigatePromise
      expect(browser.window.webContents.getURL()).to.equal(updateUrl)
    })

    it('navigates the active tab', async () => {
      const updateUrl = `${server.getUrl()}foo`
      const navigatePromise = emittedOnce(browser.window.webContents, 'did-navigate')
      browser.crx.exec('tabs.update', { url: updateUrl })
      await navigatePromise
      expect(browser.window.webContents.getURL()).to.equal(updateUrl)
    })

    it('fails on chrome:// URLs', async () => {
      const tabId = browser.webContents.id
      const tabInfo = await browser.crx.exec('tabs.update', tabId, { url: 'chrome://kill' })
      expect(tabInfo).to.be.a('null')
    })
  })

  describe('goForward()', () => {
    it('navigates the active tab forward', async () => {
      const initialUrl = browser.window.webContents.getURL()
      const targetUrl = `${server.getUrl()}foo`
      await browser.window.webContents.loadURL(targetUrl)
      expect(browser.window.webContents.navigationHistory.canGoBack()).to.be.true
      browser.window.webContents.navigationHistory.goBack()
      await emittedOnce(browser.window.webContents, 'did-navigate')
      expect(browser.window.webContents.navigationHistory.canGoForward()).to.be.true
      expect(browser.window.webContents.getURL()).to.equal(initialUrl)
      const navigatePromise = emittedOnce(browser.window.webContents, 'did-navigate')
      browser.crx.exec('tabs.goForward')
      await navigatePromise
      expect(browser.window.webContents.getURL()).to.equal(targetUrl)
    })

    it('navigates a specified tab forward', async () => {
      const tabId = browser.window.webContents.id
      const initialUrl = browser.window.webContents.getURL()
      const targetUrl = `${server.getUrl()}foo`
      await browser.window.webContents.loadURL(targetUrl)
      expect(browser.window.webContents.navigationHistory.canGoBack()).to.be.true
      browser.window.webContents.navigationHistory.goBack()
      await emittedOnce(browser.window.webContents, 'did-navigate')
      expect(browser.window.webContents.navigationHistory.canGoForward()).to.be.true
      expect(browser.window.webContents.getURL()).to.equal(initialUrl)
      const navigatePromise = emittedOnce(browser.window.webContents, 'did-navigate')
      browser.crx.exec('tabs.goForward', tabId)
      await navigatePromise
      expect(browser.window.webContents.getURL()).to.equal(targetUrl)
    })
  })

  describe('goBack()', () => {
    it('navigates the active tab back', async () => {
      const initialUrl = browser.window.webContents.getURL()
      await browser.window.webContents.loadURL(`${server.getUrl()}foo`)
      expect(browser.window.webContents.navigationHistory.canGoBack()).to.be.true
      const navigatePromise = emittedOnce(browser.window.webContents, 'did-navigate')
      browser.crx.exec('tabs.goBack')
      await navigatePromise
      expect(browser.window.webContents.getURL()).to.equal(initialUrl)
    })

    it('navigates a specified tab back', async () => {
      const tabId = browser.window.webContents.id
      const initialUrl = browser.window.webContents.getURL()
      await browser.window.webContents.loadURL(`${server.getUrl()}foo`)
      expect(browser.window.webContents.canGoBack()).to.be.true
      const navigatePromise = emittedOnce(browser.window.webContents, 'did-navigate')
      browser.crx.exec('tabs.goBack', tabId)
      await navigatePromise
      expect(browser.window.webContents.getURL()).to.equal(initialUrl)
    })
  })

  describe('executeScript()', () => {
    it('injects code into a tab', async () => {
      const tabId = browser.window.webContents.id
      const [result] = await browser.crx.exec('tabs.executeScript', tabId, {
        code: 'location.href',
      })
      expect(result).to.equal(browser.window.webContents.getURL())
    })

    it('injects code into the active tab', async () => {
      const [result] = await browser.crx.exec('tabs.executeScript', { code: 'location.href' })
      expect(result).to.equal(browser.window.webContents.getURL())
    })
  })

  describe('onCreated', () => {
    it('emits when tab is added', async () => {
      const p = browser.crx.eventOnce('tabs.onCreated')

      const secondWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          session: browser.session,
          nodeIntegration: false,
          contextIsolation: true,
        },
      })
      const secondTab = secondWindow.webContents

      const url = `${server.getUrl()}foo`
      await secondWindow.loadURL(url)

      browser.extensions.addTab(secondTab, secondWindow)

      const [tabDetails] = await p
      expect(tabDetails).to.be.an('object')
      expect(tabDetails.id).to.equal(secondTab.id)
      expect(tabDetails.windowId).to.equal(secondWindow.id)
      expect(tabDetails.url).to.equal(secondTab.getURL())
    })
  })

  describe('onUpdated', () => {
    it('emits on "tab-updated" event', async () => {
      const p = browser.crx.eventOnce('tabs.onUpdated')

      // Wait for tabs.onUpdated listener to be set
      await new Promise((resolve) => setTimeout(resolve, 10))

      assignTabDetails = (details) => {
        details.discarded = true
      }

      browser.webContents.emit('tab-updated')

      const [_tabId, changeInfo, _tabDetails] = await p
      expect(changeInfo).to.be.an('object')
      expect(Object.keys(changeInfo)).to.have.lengthOf(1)
      expect(changeInfo).to.haveOwnProperty('discarded')
      expect(changeInfo.discarded).to.equal(true)
    })
  })
})
