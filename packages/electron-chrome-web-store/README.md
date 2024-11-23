# electron-chrome-web-store

Install and manage Chrome extensions from the Chrome Web Store.

## Usage

```js
const { app, BrowserWindow, session } = require('electron')
const { installChromeWebStore } = require('electron-chrome-web-store')

(async function main() {
  await app.whenReady()

  const browserSession = session.defaultSession
  const browserWindow = new BrowserWindow({
    webPreferences: {
      session: browserSession
    }
  })

  installChromeWebStore({ session: browserSession })

  browserWindow.loadURL('https://chromewebstore.google.com/')
}())
```

To enable full support for Chrome extensions in Electron, install [electron-chrome-extensions](https://www.npmjs.com/package/electron-chrome-extensions).

## License

MIT
