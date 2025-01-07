import { expect } from 'chai'
import { session } from 'electron'
import { ElectronChromeExtensions } from '../'

describe('Extensions', () => {
  const testSession = session.fromPartition('test-extensions')
  const extensions = new ElectronChromeExtensions({
    license: 'internal-license-do-not-use' as any,
    session: testSession,
  })

  it('retrieves the instance with fromSession()', () => {
    expect(ElectronChromeExtensions.fromSession(testSession)).to.equal(extensions)
  })

  it('throws when two instances are created for session', () => {
    expect(() => {
      new ElectronChromeExtensions({
        license: 'internal-license-do-not-use' as any,
        session: testSession,
      })
    }).to.throw()
  })
})
