import { expect } from 'chai'
import { session } from 'electron'
import { Extensions } from '../dist'

describe('Extensions', () => {
  const testSession = session.fromPartition('test-extensions')
  const extensions = new Extensions({ session: testSession })

  it('retrieves the instance with fromSession()', () => {
    expect(Extensions.fromSession(testSession)).to.equal(extensions)
  })

  it('throws when two instances are created for session', () => {
    expect(() => {
      new Extensions({ session: testSession })
    }).to.throw()
  })
})
