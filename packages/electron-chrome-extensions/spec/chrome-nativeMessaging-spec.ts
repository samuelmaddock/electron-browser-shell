import { expect } from 'chai'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import * as cp from 'node:child_process'
import * as path from 'node:path'
const exec = promisify(cp.exec)

import { useExtensionBrowser, useServer } from './hooks'
import { getExtensionId } from './crx-helpers'

// TODO: build crxtesthost on Linux (see script/native-messaging-host/build.js)
if (process.platform !== 'linux') {
  describe('nativeMessaging', () => {
    const server = useServer()
    const browser = useExtensionBrowser({
      url: server.getUrl,
      extensionName: 'rpc',
    })
    const hostApplication = 'com.crx.test'

    before(async function () {
      this.timeout(60e3)
      const extensionId = await getExtensionId('rpc')
      const nativeMessagingPath = path.join(__dirname, '..', 'script', 'native-messaging-host')
      const buildScript = path.join(nativeMessagingPath, 'build.js')
      await exec(`node ${buildScript} ${extensionId}`)
    })

    describe('sendNativeMessage()', () => {
      it('sends and receives primitive value', async () => {
        const value = randomUUID()
        const result = await browser.crx.exec('runtime.sendNativeMessage', hostApplication, value)
        expect(result).to.equal(value)
      })

      it('sends and receives object', async () => {
        const value = { json: randomUUID(), wow: 'nice' }
        const result = await browser.crx.exec('runtime.sendNativeMessage', hostApplication, value)
        expect(result).to.deep.equal(value)
      })
    })
  })
}
