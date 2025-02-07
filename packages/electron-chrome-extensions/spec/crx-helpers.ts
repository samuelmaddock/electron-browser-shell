import * as path from 'node:path'
import { app, BrowserWindow, session, webContents } from 'electron'
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
  const preloadPath = path.join(__dirname, 'fixtures', 'crx-test-preload.js')
  if ('registerPreloadScript' in session) {
    session.registerPreloadScript({
      id: 'crx-test-preload',
      type: 'frame',
      filePath: preloadPath,
    })
  } else {
    // @ts-expect-error Deprecated electron@<35
    session.setPreloads([...session.getPreloads(), preloadPath])
  }
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

const isBackgroundHostSupported = (extension: Electron.Extension) =>
  extension.manifest.manifest_version === 2 && extension.manifest.background?.scripts?.length > 0

export const waitForBackgroundPage = async (
  extension: Electron.Extension,
  session: Electron.Session,
) => {
  if (!isBackgroundHostSupported(extension)) return

  return await new Promise<Electron.WebContents>((resolve) => {
    const resolveHost = (wc: Electron.WebContents) => {
      app.removeListener('web-contents-created', onWebContentsCreated)
      resolve(wc)
    }

    const hostPredicate = (wc: Electron.WebContents) =>
      !wc.isDestroyed() && wc.getURL().includes(extension.id) && wc.session === session

    const observeWebContents = (wc: Electron.WebContents) => {
      if (wc.getType() !== 'backgroundPage') return

      if (hostPredicate(wc)) {
        resolveHost(wc)
        return
      }

      wc.once('did-frame-navigate', () => {
        if (hostPredicate(wc)) {
          resolveHost(wc)
        }
      })
    }

    const onWebContentsCreated = (_event: any, wc: Electron.WebContents) => observeWebContents(wc)

    webContents.getAllWebContents().forEach(observeWebContents)
    app.on('web-contents-created', onWebContentsCreated)
  })
}

export async function waitForBackgroundScriptEvaluated(
  extension: Electron.Extension,
  session: Electron.Session,
) {
  if (!isBackgroundHostSupported(extension)) return

  const backgroundHost = await waitForBackgroundPage(extension, session)
  if (!backgroundHost) return

  await new Promise<void>((resolve) => {
    const onConsoleMessage = (_event: any, _level: any, message: string) => {
      if (message === 'background-script-evaluated') {
        backgroundHost.removeListener('console-message', onConsoleMessage)
        resolve()
      }
    }
    backgroundHost.on('console-message', onConsoleMessage)
  })
}

export async function getExtensionId(name: string) {
  const extensionPath = path.join(__dirname, 'fixtures', name)
  const ses = createCrxSession().session
  const extension = await ses.loadExtension(extensionPath)
  return extension.id
}
