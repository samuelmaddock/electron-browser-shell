import { expect } from 'chai'
import { webContents } from 'electron'
import * as path from 'node:path'

import { useExtensionBrowser, useServer } from './hooks'
import {
  isHostPattern,
  originCovered,
  patternCovers,
  splitPermissions,
} from '../src/browser/api/lib/host-permissions'

describe('host permission matching', () => {
  it('classifies host patterns', () => {
    for (const p of ['<all_urls>', '*://*/*', 'file:///*', 'https://*.example.com/*', 'ws://a/']) {
      expect(isHostPattern(p), p).to.equal(true)
    }
    for (const p of ['storage', 'tabs', 'webRequestBlocking', 'unlimitedStorage', 'https://a']) {
      expect(isHostPattern(p), p).to.equal(false)
    }
  })

  it('splits manifest permissions', () => {
    expect(splitPermissions(['storage', '<all_urls>', 'tabs', '*://*/*'])).to.deep.equal({
      permissions: ['storage', 'tabs'],
      origins: ['<all_urls>', '*://*/*'],
    })
  })

  it('matches exact strings', () => {
    expect(patternCovers('https://a.test/*', 'https://a.test/*')).to.equal(true)
    expect(originCovered(['https://a.test/'], 'https://a.test/')).to.equal(true)
  })

  it('<all_urls> covers http, https, ws, wss, ftp and file', () => {
    for (const o of [
      'https://blacklist.tampermonkey.net/',
      'http://a.test/x',
      'ws://a.test/',
      'wss://a.test/',
      'ftp://a.test/',
      'file:///tmp/x',
      '*://*/*',
    ]) {
      expect(patternCovers('<all_urls>', o), o).to.equal(true)
    }
    expect(patternCovers('<all_urls>', 'chrome://settings/')).to.equal(false)
  })

  it('* scheme covers http and https only', () => {
    expect(patternCovers('*://*/*', 'https://a.test/')).to.equal(true)
    expect(patternCovers('*://*/*', 'http://a.test/')).to.equal(true)
    expect(patternCovers('*://*/*', 'ws://a.test/')).to.equal(false)
    expect(patternCovers('*://*/*', '<all_urls>')).to.equal(false)
  })

  it('*.host covers subdomains and the bare domain', () => {
    expect(patternCovers('https://*.example.com/*', 'https://example.com/')).to.equal(true)
    expect(patternCovers('https://*.example.com/*', 'https://a.b.example.com/')).to.equal(true)
    expect(patternCovers('https://*.example.com/*', 'https://*.sub.example.com/*')).to.equal(true)
    expect(patternCovers('https://*.example.com/*', 'https://badexample.com/')).to.equal(false)
    expect(patternCovers('https://*.example.com/*', 'http://example.com/')).to.equal(false)
  })

  it('rejects uncovered hosts', () => {
    expect(originCovered(['https://a.test/*'], 'https://b.test/')).to.equal(false)
    expect(originCovered([], 'https://a.test/')).to.equal(false)
  })
})

describe('chrome.permissions', () => {
  const server = useServer()
  const browser = useExtensionBrowser({
    url: server.getUrl,
    extensionName: 'chrome-permissions-mv2',
  })

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
  const bg = (js: string) => background().executeJavaScript(js)

  const api = () => (browser.extensions as any).api.permissions

  describe('MV2 with <all_urls> in permissions', () => {
    it('contains() is true for an origin covered by <all_urls>', async () => {
      const result = await bg(
        `chrome.permissions.contains({ origins: ['https://blacklist.tampermonkey.net/'] })`,
      )
      expect(result).to.equal(true)
    })

    it('getAll() lists host patterns under origins, not permissions', async () => {
      const all = await bg(`chrome.permissions.getAll()`)
      expect(all.origins).to.include('<all_urls>')
      expect(all.origins).to.include('https://*.example.com/*')
      expect(all.permissions).to.not.include('<all_urls>')
      expect(all.permissions).to.deep.equal(['storage', 'tabs'])
    })

    it('does not grant optional host patterns', async () => {
      const all = await bg(`chrome.permissions.getAll()`)
      expect(all.origins).to.not.include('*://optional.test/*')
    })

    it('request() for a covered origin resolves true without prompting', async () => {
      let prompted = false
      ;(browser.extensions as any).ctx.store.impl.requestPermissions = async () => {
        prompted = true
        return false
      }
      const granted = await api().request(
        { extension: browser.extension },
        { origins: ['https://blacklist.tampermonkey.net/'] },
      )
      expect(granted).to.equal(true)
      expect(prompted).to.equal(false)
    })

    it('request() rejects an undeclared origin', async () => {
      const permissions = (browser.extensions as any).api.permissions
      await expect(
        permissions.request({ extension: browser.extension }, { origins: ['chrome://x/'] }),
      ).to.be.rejectedWith('undeclared origin')
    })
  })

  describe('MV3 without host permissions', () => {
    const loadMv3 = () =>
      browser.session.loadExtension(path.join(__dirname, 'fixtures', 'chrome-permissions-mv3'))

    it('contains() is false for an origin', async () => {
      const extension = await loadMv3()
      const result = api().contains(
        { extension },
        { origins: ['https://blacklist.tampermonkey.net/'] },
      )
      expect(result).to.equal(false)
    })

    it('request() prompts for an optional host and grants it on approval', async () => {
      const extension = await loadMv3()
      const prompts: chrome.permissions.Permissions[] = []
      ;(browser.extensions as any).ctx.store.impl.requestPermissions = async (
        _ext: Electron.Extension,
        req: chrome.permissions.Permissions,
      ) => {
        prompts.push(req)
        return true
      }
      const granted = await api().request({ extension }, { origins: ['https://optional.test/a'] })
      expect(granted).to.equal(true)
      expect(prompts).to.deep.equal([{ origins: ['https://optional.test/a'] }])
      expect(api().contains({ extension }, { origins: ['https://optional.test/a'] })).to.equal(true)
    })
  })
})
