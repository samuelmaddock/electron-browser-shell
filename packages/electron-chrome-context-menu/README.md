# electron-chrome-context-menu

> Chrome context menu for Electron browsers

Building a modern web browser requires including many features users have grown accustomed to. Context menus are a small, but noticeable feature when done improperly.

This module aims to provide a context menu with close to feature parity to that of Google Chrome.

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

> For a complete example, see the [`electron-browser-shell`](https://github.com/samuelmaddock/electron-browser-shell) project.

## API

### `buildChromeContextMenu(options)`

* `options` Object
  * `params` Electron.ContextMenuParams - Context menu parameters emitted from the WebContents 'context-menu' event.
  * `webContents` Electron.WebContents - WebContents which emitted the 'context-menu' event.
  * `openLink(url, disposition, params)` - Handler for opening links.
    * `url` String
    * `disposition` String - Can be `default`, `foreground-tab`, `background-tab`, and `new-window`.
    * `params` Electron.ContextMenuParams
  * `extensionMenuItems` Electron.MenuItem[] (optional) - Collection of menu items for active web extensions.
  * `labels` Object (optional) - Labels used to create menu items. Replace this if localization is needed.

## License

MIT
