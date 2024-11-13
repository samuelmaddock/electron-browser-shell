# electron-chrome-web-store

Install and manage Chrome extensions from the Chrome Web Store.

## Usage

```js
const { app, BrowserWindow, session } = require('electron')
const { setupChromeWebStore } = require('electron-chrome-web-store')

(async function main() {
  await app.whenReady()

  const browserSession = session.defaultSession
  const browserWindow = new BrowserWindow({
    webPreferences: {
      session: browserSession
    }
  })

  setupChromeWebStore(browserSession)

  browserWindow.loadURL('https://chromewebstore.google.com/')
}())
```