import * as path from 'path'
import { BrowserWindow, session } from 'electron'
import { uuid } from './spec-helpers'

export const createCrxSession = () => {
  const partitionName = `crx-${uuid()}`
  const partition = `persist:${partitionName}`
  return {
    partitionName,
    partition,
    session: session.fromPartition(partition),
  }
}

export const addCrxPreload = (session: Electron.Session) => {
  const preload = path.join(__dirname, 'fixtures', 'crx-test-preload.js')
  session.setPreloads([...session.getPreloads(), preload])
}

export const createCrxRemoteWindow = () => {
  const sessionDetails = createCrxSession()
  addCrxPreload(sessionDetails.session)

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      session: sessionDetails.session,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  return win
}
