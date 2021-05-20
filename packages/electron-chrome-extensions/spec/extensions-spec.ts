import { expect } from 'chai'
import { session } from 'electron'
import { ElectronChromeExtensions } from '../dist'

describe('Extensions', () => {
  const testSession = session.fromPartition('test-extensions')
  const extensions = new ElectronChromeExtensions({ session: testSession })

  it('retrieves the instance with fromSession()', () => {
    expect(ElectronChromeExtensions.fromSession(testSession)).to.equal(extensions)
  })

  it('throws when two instances are created for session', () => {
    expect(() => {
      new ElectronChromeExtensions({ session: testSession })
    }).to.throw()
  })
})
