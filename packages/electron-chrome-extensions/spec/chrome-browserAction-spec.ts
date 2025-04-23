import * as path from 'node:path'
import { expect } from 'chai'
import { BrowserView, Extension, ipcMain, session, WebContents, WebContentsView } from 'electron'

import { emittedOnce } from './events-helpers'
import { uuid } from './spec-helpers'
import { useExtensionBrowser, useServer } from './hooks'
import { createCrxRemoteWindow } from './crx-helpers'
import { ElectronChromeExtensions } from '../'

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
    tabId: number = -1,
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

      if ('registerPreloadScript' in otherSession) {
        browser.session.getPreloadScripts().forEach((script: any) => {
          otherSession.registerPreloadScript(script)
        })
      } else {
        // @ts-expect-error Deprecated electron@<35
        otherSession.setPreloads(browser.session.getPreloads())
      }

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
        `chrome-extension://${browser.extension.id}/${popupPath}`,
      )
    })
  })

  describe('<browser-action-list> element', () => {
    const basePath = path.join(__dirname, 'fixtures/browser-action-list')

    const browser = useExtensionBrowser({
      extensionName: 'chrome-browserAction-popup',
    })

    const getExtensionActionIds = async (
      webContents: Electron.WebContents = browser.webContents,
    ) => {
      // Await update propagation to avoid flaky tests
      await new Promise((resolve) => setTimeout(resolve, 10))

      return await webContents.executeJavaScript(
        `(${() => {
          const list = document.querySelector('browser-action-list')!
          const actions = list.shadowRoot!.querySelectorAll('.action')
          const ids = Array.from(actions).map((elem) => elem.id)
          return ids
        }})();`,
      )
    }

    it('lists actions', async () => {
      await browser.webContents.loadFile(path.join(basePath, 'default.html'))
      const extensionIds = await getExtensionActionIds()
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
        }})('${browser.partition}');`,
      )

      const extensionIds = await getExtensionActionIds(remoteTab)
      expect(extensionIds).to.deep.equal([browser.extension.id])
    })

    it('removes action for unloaded extension', async () => {
      await browser.webContents.loadFile(path.join(basePath, 'default.html'))
      expect(browser.session.getExtension(browser.extension.id)).to.be.an('object')
      browser.session.removeExtension(browser.extension.id)
      expect(browser.session.getExtension(browser.extension.id)).to.be.an('null')

      const extensionIds = await getExtensionActionIds()
      expect(extensionIds).to.have.lengthOf(0)
    })
  })

  describe('crx:// protocol', () => {
    const browser = useExtensionBrowser({
      url: server.getUrl,
      extensionName: 'chrome-browserAction-popup',
    })

    it('supports same-session requests', async () => {
      ElectronChromeExtensions.handleCRXProtocol(browser.session)

      // Load again now that crx protocol is handled
      await browser.webContents.loadURL(server.getUrl())

      const result = await browser.webContents.executeJavaScript(
        `(${function (extensionId: any, tabId: any) {
          const img = document.createElement('img')
          const params = new URLSearchParams({
            tabId: `${tabId}`,
            t: `${Date.now()}`,
          })
          const src = `crx://extension-icon/${extensionId}/32/2?${params.toString()}`
          return new Promise((resolve, reject) => {
            img.onload = () => resolve('success')
            img.onerror = () => {
              reject(new Error('error loading img, check devtools console' + src))
            }
            img.src = src
          })
        }})(${[browser.extension.id, browser.webContents.id]
          .map((v) => JSON.stringify(v))
          .join(', ')});`,
      )

      expect(result).to.equal('success')
    })

    it('supports cross-session requests', async () => {
      const extensionsPartition = browser.partition
      const otherSession = session.fromPartition(`persist:crx-${uuid()}`)
      ElectronChromeExtensions.handleCRXProtocol(otherSession)

      browser.session.getPreloadScripts().forEach((script) => {
        otherSession.registerPreloadScript(script)
      })

      const view = new WebContentsView({
        webPreferences: { session: otherSession, nodeIntegration: false, contextIsolation: true },
      })
      browser.window.contentView.addChildView(view)
      await view.webContents.loadURL(server.getUrl())

      const result = await view.webContents.executeJavaScript(
        `(${function (extensionId: any, tabId: any, partition: any) {
          const img = document.createElement('img')
          const params = new URLSearchParams({
            tabId: `${tabId}`,
            partition,
            t: `${Date.now()}`,
          })
          const src = `crx://extension-icon/${extensionId}/32/2?${params.toString()}`
          return new Promise((resolve, reject) => {
            img.onload = () => resolve('success')
            img.onerror = () => {
              reject(new Error('error loading img, check devtools console'))
            }
            img.src = src
          })
        }})(${[browser.extension.id, browser.webContents.id, extensionsPartition]
          .map((v) => JSON.stringify(v))
          .join(', ')});`,
      )

      expect(result).to.equal('success')
    })
  })
})
