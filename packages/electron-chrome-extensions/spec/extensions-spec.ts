import { expect } from 'chai'
import { session } from 'electron'
import { ElectronChromeExtensions } from '../'
import { waitForBackgroundPage } from './crx-helpers'
import { useExtensionBrowser } from './hooks'

describe('Extensions', () => {
  const testSession = session.fromPartition('test-extensions')
  const extensions = new ElectronChromeExtensions({
    session: testSession,
  })

  it('retrieves the instance with fromSession()', () => {
    expect(ElectronChromeExtensions.fromSession(testSession)).to.equal(extensions)
  })

  it('throws when two instances are created for session', () => {
    expect(() => {
      new ElectronChromeExtensions({
        session: testSession,
      })
    }).to.throw()
  })

  describe('browser namespace', () => {
    const browser = useExtensionBrowser({ extensionName: 'rpc' })

    it('aliases browser to the patched chrome object', async () => {
      const backgroundPage = await waitForBackgroundPage(browser.extension, browser.session)
      const result = await backgroundPage!.executeJavaScript(
        `browser === chrome && typeof browser.browserAction.setBadgeText === 'function'`,
      )
      expect(result).to.equal(true)
    })
  })
})
