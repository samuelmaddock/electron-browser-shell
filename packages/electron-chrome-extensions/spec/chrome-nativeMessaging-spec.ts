import { promisify } from 'node:util'
import * as cp from 'node:child_process'
import * as path from 'node:path'
const exec = promisify(cp.exec)

import { useExtensionBrowser, useServer } from './hooks'
import { getExtensionId } from './crx-helpers'

// TODO:
describe.skip('nativeMessaging', () => {
  const server = useServer()
  const browser = useExtensionBrowser({
    url: server.getUrl,
    extensionName: 'rpc',
  })
  const hostApplication = 'com.crx.test'

  before(async () => {
    const extensionId = await getExtensionId('rpc')
    const scriptPath = path.join(__dirname, '..', 'script', 'native-messaging-host', 'build.js')
    await exec(`${scriptPath} ${extensionId}`)
  })

  describe('connectNative()', () => {
    it('returns tab details', async () => {
      const result = await browser.crx.exec('runtime.connectNative', hostApplication)
      console.log({ result })
    })
  })
})
