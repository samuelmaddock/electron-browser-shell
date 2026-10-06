import { expect } from 'chai'
import { webContents } from 'electron'

import { useExtensionBrowser, useServer } from './hooks'

const waitFor = async <T>(fn: () => Promise<T>, done: (value: T) => boolean) => {
  for (let i = 0; i < 50; i++) {
    const value = await fn()
    if (done(value)) return value
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return fn()
}

describe('chrome.userScripts', () => {
  const server = useServer()
  const browser = useExtensionBrowser({ url: server.getUrl, extensionName: 'chrome-userScripts' })

  const page = (js: string) => browser.webContents.executeJavaScript(js)

  it('runs USER_SCRIPT world scripts in an isolated world that can message the extension', async () => {
    await browser.webContents.loadURL(server.getUrl())
    const reply = await waitFor(
      () => page('document.documentElement.dataset.reply'),
      (value) => !!value,
    )
    expect(await page('document.documentElement.dataset.world')).to.equal('isolated')
    expect(reply).to.equal('pong')
  })

  it('runs MAIN world scripts in the page', async () => {
    await browser.webContents.loadURL(server.getUrl())
    const main = await waitFor(
      () => page('window.mainWorld'),
      (value) => value !== undefined,
    )
    expect(main).to.equal(true)
  })

  it('honors excludeMatches', async () => {
    await browser.webContents.loadURL(server.getUrl())
    await waitFor(
      () => page('window.mainWorld'),
      (value) => value !== undefined,
    )
    expect(await page('window.excluded')).to.equal(undefined)
  })
})

describe('chrome.offscreen', () => {
  const server = useServer()
  const browser = useExtensionBrowser({ url: server.getUrl, extensionName: 'chrome-userScripts' })

  const background = () => {
    const host = webContents
      .getAllWebContents()
      .find(
        (wc) =>
          wc.session === browser.session &&
          wc.getType() === 'backgroundPage' &&
          wc.getURL().startsWith(browser.extension.url),
      )
    if (!host) throw new Error('background page not found')
    return host
  }

  it('creates, reports and closes an offscreen document', async () => {
    const bg = background()
    const result = await bg.executeJavaScript(`(async () => {
      await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['TESTING'], justification: 'test' })
      const has = await chrome.offscreen.hasDocument()
      const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })
      return { has, contexts }
    })()`)
    expect(result.has).to.equal(true)
    expect(result.contexts).to.have.length(1)
    expect(result.contexts[0].documentUrl).to.equal(`${browser.extension.url}offscreen.html`)

    const ready = await waitFor(
      () => bg.executeJavaScript('!!globalThis.offscreenReady'),
      (v) => v,
    )
    expect(ready).to.equal(true)

    const after = await bg.executeJavaScript(`(async () => {
      await chrome.offscreen.closeDocument()
      return chrome.offscreen.hasDocument()
    })()`)
    expect(after).to.equal(false)
  })
})
