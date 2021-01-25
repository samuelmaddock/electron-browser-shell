# electron-chrome-context-menu

> Chrome context menu for Electron browsers

## Install

> npm install electron-chrome-context-menu

## Usage

```ts
// ES imports
import buildChromeContextMenu from 'electron-chrome-context-menu'
// CommonJS
const buildChromeContextMenu = require('electron-chrome-context-menu').default

const { app } = require('electron')

app.on('web-contents-created', (event, webContents) => {
  webContents.on('context-menu', (e, params) => {
    const menu = buildChromeContextMenu({
      params,
      webContents,
      openLink: (url, disposition) => {
        webContents.loadURL(url)
      }
    })

    menu.popup()
  })
})
```

## API

### `buildChromeContextMenu(options)`

* `options` Object
  * `params` Electron.ContextMenuParams - Context menu parameters emitted from the WebContents 'context-menu' event.
  * `webContents` Electron.WebContents - WebContents which emitted the 'context-menu' event.
  * `openLink(url, disposition, params)` - Handler for opening links.
    * `url` String
    * `disposition` String - Can be `default`, `foreground-tab`, `background-tab`, and `new-window`.
    * `params` Electron.ContextMenuParams
  * `extensionMenuItems` Electron.MenuItem[] (optional) - Collection of menu items for activate web extensions.
  * `strings` Object (optional) - Strings used to create menu items. Replace this if localization is needed.

## License

MIT
