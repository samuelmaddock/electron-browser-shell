# electron-chrome-web-store

Install and manage Chrome extensions from the Chrome Web Store.

## Usage

```js
const { app, BrowserWindow, session } = require('electron')
const { installChromeWebStore } = require('electron-chrome-web-store')

async function main() {
  await app.whenReady()

  const browserSession = session.defaultSession
  const browserWindow = new BrowserWindow({
    webPreferences: {
      session: browserSession,
    },
  })

  installChromeWebStore({ session: browserSession })

  browserWindow.loadURL('https://chromewebstore.google.com/')
}

main()
```

To enable full support for Chrome extensions in Electron, install [electron-chrome-extensions](https://www.npmjs.com/package/electron-chrome-extensions).

## API

### `installChromeWebStore`

Installs Chrome Web Store support in the specified session.

- `options`: An object with the following properties:
  - `session`: The Electron session to enable the Chrome Web Store in. Defaults to `session.defaultSession`.
  - `modulePath`: The path to the 'electron-chrome-web-store' module.
  - `extensionsPath`: The path to the extensions directory. Defaults to 'Extensions/' under the app's userData path.
  - `loadExtensions`: A boolean indicating whether to load extensions installed by Chrome Web Store. Defaults to true.
  - `allowUnpackedExtensions`: A boolean indicating whether to allow loading unpacked extensions. Only loads if `loadExtensions` is also enabled. Defaults to false.
  - `allowlist`: An array of allowed extension IDs to install.
  - `denylist`: An array of denied extension IDs to install.

### `loadAllExtensions`

Loads all extensions from the specified directory.

- `session`: The Electron session to load extensions in.
- `extensionsPath`: The path to the directory containing the extensions.
- `options`: An object with the following property:
  - `allowUnpacked`: A boolean indicating whether to allow loading unpacked extensions. Defaults to false.

> [!NOTE] \
> `installChromeWebStore` will automatically load installed extensions as long as the `loadExtensions` property is set to `true`.

### `downloadExtension`

Downloads an extension from the Chrome Web Store to the specified destination directory.

- `extensionId`: The ID of the extension to download.
- `destDir`: The destination directory where the extension will be downloaded. The directory is expected to exist.

> [!TIP]
> This API is designed to work in Node or Electron.

## License

MIT
