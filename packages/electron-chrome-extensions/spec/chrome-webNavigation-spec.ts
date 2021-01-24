import { expect } from 'chai'
import { ipcMain } from 'electron'

import { useExtensionBrowser, useServer } from './hooks'

describe('chrome.webNavigation', () => {
  const server = useServer()
  const browser = useExtensionBrowser({ url: server.getUrl, extensionName: 'chrome-webNavigation' })

  // TODO: for some reason 'onCommitted' will sometimes not arrive
  it.skip('emits events in the correct order', async () => {
    const expectedEventLog = [
      'onBeforeNavigate',
      'onCommitted',
      'onDOMContentLoaded',
      'onCompleted',
    ]

    const eventsPromise = new Promise((resolve) => {
      const eventLog: string[] = []
      ipcMain.on('logEvent', (e, eventName) => {
        if (eventLog.length === 0 && eventName !== 'onBeforeNavigate') {
          // ignore events that come in late from initial load
          return
        }

        eventLog.push(eventName)

        if (eventLog.length === expectedEventLog.length) {
          resolve(eventLog)
        }
      })
    })

    await browser.window.webContents.loadURL(`${server.getUrl()}`)

    const eventLog = await eventsPromise
    expect(eventLog).to.deep.equal(expectedEventLog)
  })
})
