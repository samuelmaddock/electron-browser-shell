# electron-chrome-extensions

> Chrome extension API support for Electron.

## Install

```
npm install electron-chrome-extensions
```

## Usage

### Basic

Simple browser using Electron's [default session](https://www.electronjs.org/docs/api/session#sessiondefaultsession) and one tab.

```js
const { app, BrowserWindow } = require('electron')
const { Extensions } = require('electron-chrome-extensions')

(async function main() {
  await app.whenReady()

  const extensions = new Extensions()
  const win = new BrowserWindow()

  // Adds the active tab of the browser
  extensions.addTab(win.webContents)

  win.loadURL('https://samuelmaddock.com')
  win.show()
}())
```

### Advanced

Multi-tab browser with full support for Chrome extension APIs.

> For a complete example, see the [`electron-browser-shell`](https://github.com/samuelmaddock/electron-browser-shell) project.

```js
const { app, session, BrowserWindow } = require('electron')
const { Extensions } = require('electron-chrome-extensions')

(async function main() {
  await app.whenReady()

  const browserSession = session.fromPartition('persist:custom')

  const extensions = new Extensions({
    session: browserSession,
    createTab(event, details) {
      // Optionally implemented for chrome.tabs.create support
    },
    selectTab(event, tab) {
      // Optionally implemented for chrome.tabs.update support
    },
    removeTab(event, tab) {
      // Optionally implemented for chrome.tabs.remove support
    },
    createWindow(event, details) {
      // Optionally implemented for chrome.windows.create support
    }
  })

  const win = new BrowserWindow({
    webPreferences: {
      // Same session given to Extensions class
      session: browserSession,
      // Recommended options for loading remote content
      sandbox: true,
      contextIsolation: true
    }
  })

  // Adds the active tab of the browser
  extensions.addTab(win.webContents)

  win.loadURL('https://samuelmaddock.com')
  win.show()
}())
```

## API

### Class: Extensions

> Create browser APIs for handling Chrome extension requests.

#### `new Extensions([options])`

* `options` Object (optional)
  * `session` Electron.Session (optional) - Session which should support
    Chrome extension APIs. `session.defaultSession` is used by default.
  * `createTab(event, details) => Promise<Electron.WebContents>` (optional) -
    Called when `chrome.tabs.create` is invoked by an extension. Allows the
    application to handle how tabs are created.
  * `selectTab(event, webContents)` (optional) - Called when
    `chrome.tabs.update` is invoked by an extension with the option to set the
    active tab.
  * `removeTab(event, webContents)` (optional) - Called when
    `chrome.tabs.remove` is invoked by an extension.
  * `createWindow(event, details) => Promise<Electron.BrowserWindow>`
    (optional) - Called when `chrome.windows.create` is invoked by an extension.

```ts
new Extensions({
  createTab(event, details) {
    const tab = myTabApi.createTab()
    if (details.url) {
      tab.loadURL(details.url)
    }
    return tab
  },
  createWindow(event, details) {
    const window = new BrowserWindow()
    return window
  }
})
```

For a complete usage example, see the browser implementation in the
[`electron-browser-shell`](https://github.com/samuelmaddock/electron-browser-shell/blob/master/packages/shell/browser/main.js)
project.

#### Instance Methods

##### `extensions.addTab(tab)`

- `tab` Electron.WebContents - A tab that the extension system should keep
  track of.

Makes the tab accessible from the `chrome.tabs` API.

##### `extensions.selectTab(tab)`

- `tab` Electron.WebContents

Notify the extension system that a tab has been selected as the active tab.

##### `extensions.getContextMenuItems(tab, params)`

- `tab` Electron.WebContents - The tab from which the context-menu event originated.
- `params` Electron.ContextMenuParams - Parameters from the [`context-menu` event](https://www.electronjs.org/docs/api/web-contents#event-context-menu).

Returns [`Electron.MenuItem[]`](https://www.electronjs.org/docs/api/menu-item#class-menuitem) -
An array of all extension context menu items given the context.

##### `extensions.addExtension(extension)`

- `extension` Electron.Extension

Adds an extension to be tracked by the `chrome.browserAction` API. This allows
the extension to appear as a button in the browser top bar.

This method will soon go away and no longer be necessary.

### Element: `<browser-action-list>`

The `<browser-action-list>` element provides a row of [browser actions](https://developer.chrome.com/extensions/browserAction) which may be pressed to activate the `chrome.browserAction.onClicked` event or display the extension popup.

To enable the element on a webpage, you must define a preload script which injects the API on specific pages.

#### Attributes

- `tab` string - The tab's `Electron.WebContents` ID to use for displaying
  the relevant browser action state.

#### Browser action example

##### Preload
```js
import { injectBrowserAction } from 'electron-chrome-extensions/dist/browser-action'

// Inject <browser-action-list> element into our browser
if (location.href === 'webui://browser-chrome.html') {
  injectBrowserAction()
}
```

> The use of `import` implies that your preload script must be compiled using a JavaScript bundler like Webpack.

##### Webpage
```html
<browser-action-list tab="1"></browser-action-list>
```

## Supported `chrome.*` APIs

The following APIs are supported, in addition to [those already built-in to Electron.](https://www.electronjs.org/docs/api/extensions)

Although certain APIs may not be implemented, some methods and properties are still defined as noops.

<details>
<summary>Click to reveal supported APIs</summary>

### [`chrome.browserAction`](https://developer.chrome.com/extensions/browserAction)

- [x] chrome.browserAction.setTitle
- [ ] chrome.browserAction.getTitle
- [x] chrome.browserAction.setIcon
- [x] chrome.browserAction.setPopup
- [ ] chrome.browserAction.getPopup
- [x] chrome.browserAction.setBadgeText
- [ ] chrome.browserAction.getBadgeText
- [x] chrome.browserAction.setBadgeBackgroundColor
- [ ] chrome.browserAction.getBadgeBackgroundColor
- [ ] chrome.browserAction.enable
- [ ] chrome.browserAction.disable
- [ ] chrome.browserAction.onClicked

### [`chrome.contextMenus`](https://developer.chrome.com/extensions/contextMenus)

- [x] chrome.contextMenus.create
- [ ] chrome.contextMenus.update
- [x] chrome.contextMenus.remove
- [x] chrome.contextMenus.removeAll
- [x] chrome.contextMenus.onClicked

### [`chrome.runtime`](https://developer.chrome.com/extensions/runtime)

- [x] chrome.runtime.connect
- [x] chrome.runtime.getBackgroundPage
- [x] chrome.runtime.getManifest
- [x] chrome.runtime.getURL
- [x] chrome.runtime.id
- [x] chrome.runtime.lastError
- [x] chrome.runtime.onConnect
- [x] chrome.runtime.onInstalled
- [x] chrome.runtime.onMessage
- [x] chrome.runtime.onStartup
- [x] chrome.runtime.onSuspend
- [x] chrome.runtime.onSuspendCanceled
- [x] chrome.runtime.openOptionsPage
- [x] chrome.runtime.sendMessage

### [`chrome.tabs`](https://developer.chrome.com/extensions/tabs)

- [x] chrome.tabs.get
- [x] chrome.tabs.getCurrent
- [x] chrome.tabs.connect
- [x] chrome.tabs.sendMessage
- [x] chrome.tabs.create
- [ ] chrome.tabs.duplicate
- [x] chrome.tabs.query
- [ ] chrome.tabs.highlight
- [x] chrome.tabs.update
- [ ] chrome.tabs.move
- [x] chrome.tabs.reload
- [x] chrome.tabs.remove
- [ ] chrome.tabs.detectLanguage
- [ ] chrome.tabs.captureVisibleTab
- [x] chrome.tabs.executeScript
- [x] chrome.tabs.insertCSS
- [x] chrome.tabs.setZoom
- [x] chrome.tabs.getZoom
- [x] chrome.tabs.setZoomSettings
- [x] chrome.tabs.getZoomSettings
- [ ] chrome.tabs.discard
- [x] chrome.tabs.goForward
- [x] chrome.tabs.goBack
- [x] chrome.tabs.onCreated
- [x] chrome.tabs.onUpdated
- [ ] chrome.tabs.onMoved
- [x] chrome.tabs.onActivated
- [ ] chrome.tabs.onHighlighted
- [ ] chrome.tabs.onDetached
- [ ] chrome.tabs.onAttached
- [x] chrome.tabs.onRemoved
- [ ] chrome.tabs.onReplaced
- [x] chrome.tabs.onZoomChange

### [`chrome.webNavigation`](https://developer.chrome.com/extensions/webNavigation)

- [ ] chrome.webNavigation.getFrame
- [ ] chrome.webNavigation.getAllFrames
- [ ] chrome.webNavigation.onBeforeNavigate
- [x] chrome.webNavigation.onCommitted
- [ ] chrome.webNavigation.onDOMContentLoaded
- [ ] chrome.webNavigation.onCompleted
- [ ] chrome.webNavigation.onErrorOccurred
- [x] chrome.webNavigation.onCreateNavigationTarget
- [ ] chrome.webNavigation.onReferenceFragmentUpdated
- [ ] chrome.webNavigation.onTabReplaced
- [x] chrome.webNavigation.onHistoryStateUpdated

### [`chrome.windows`](https://developer.chrome.com/extensions/windows)

- [x] chrome.windows.get
- [ ] chrome.windows.getCurrent
- [ ] chrome.windows.getLastFocused
- [ ] chrome.windows.getAll
- [x] chrome.windows.create
- [x] chrome.windows.update
- [x] chrome.windows.remove
- [ ] chrome.windows.onCreated
- [ ] chrome.windows.onRemoved
- [ ] chrome.windows.onFocusChanged
- [ ] chrome.windows.onBoundsChanged
</details>

## Limitations

### electron-chrome-extensions
- Uses features which will land in Electron v11 stable. Minimum support requires Electron v9.
- Currently only one session can be supported.
- Chrome's Manifest V3 extensions are not yet supported.

### electron
- Usage of Electron's `webRequest` API will prevent `chrome.webRequest` listeners from being called.

## License

GPL-3

For proprietary use, please [contact me](mailto:sam@samuelmaddock.com?subject=electron-chrome-extensions%20license) or [sponsor me on GitHub](https://github.com/sponsors/samuelmaddock/) under the appropriate tier to [acquire a proprietary-use license](https://github.com/samuelmaddock/electron-browser-shell/blob/master/LICENSE-PATRON.md). These contributions help make development and maintenance of this project more sustainable and show appreciation for the work thus far.
