# electron-chrome-extensions

> Chrome extension API support for Electron.

Electron provides [basic support](https://www.electronjs.org/docs/api/extensions) for Chrome extensions out of the box. However, it only supports a subset of APIs with a focus on DevTools. Concepts like tabs, popups, and extension actions aren't known to Electron.

This library aims to bring extension support in Electron up to the level you'd come to expect from a browser like Google Chrome. API behavior is customizable so you can define how to handle things like tab or window creation specific to your application's needs.

## Install

```
npm install electron-chrome-extensions
```

## Screenshots

| uBlock Origin | Dark Reader |
|---|---|
| <img src="https://raw.githubusercontent.com/samuelmaddock/electron-browser-shell/master/packages/electron-chrome-extensions/screenshot-ublock-origin.png" width="405"> | <img src="https://raw.githubusercontent.com/samuelmaddock/electron-browser-shell/master/packages/electron-chrome-extensions/screenshot-dark-reader.png" width="391"> |

## Usage

### Basic

Simple browser using Electron's [default session](https://www.electronjs.org/docs/api/session#sessiondefaultsession) and one tab.

```js
const { app, BrowserWindow } = require('electron')
const { Extensions } = require('electron-chrome-extensions')

(async function main() {
  await app.whenReady()

  const extensions = new Extensions()
  const browserWindow = new BrowserWindow()

  // Adds the active tab of the browser
  extensions.addTab(browserWindow.webContents, browserWindow)

  browserWindow.loadURL('https://samuelmaddock.com')
  browserWindow.show()
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
    createTab(details) {
      // Optionally implemented for chrome.tabs.create support
    },
    selectTab(tab, browserWindow) {
      // Optionally implemented for chrome.tabs.update support
    },
    removeTab(tab, browserWindow) {
      // Optionally implemented for chrome.tabs.remove support
    },
    createWindow(details) {
      // Optionally implemented for chrome.windows.create support
    }
  })

  const browserWindow = new BrowserWindow({
    webPreferences: {
      // Same session given to Extensions class
      session: browserSession,
      // Recommended options for loading remote content
      sandbox: true,
      contextIsolation: true
    }
  })

  // Adds the active tab of the browser
  extensions.addTab(browserWindow.webContents, browserWindow)

  browserWindow.loadURL('https://samuelmaddock.com')
  browserWindow.show()
}())
```

## API

### Class: Extensions

> Create browser APIs for handling Chrome extension requests.

#### `new Extensions([options])`

* `options` Object (optional)
  * `modulePath` String (optional) - Path to electron-chrome-extensions module files. Might be needed if JavaScript bundlers like Webpack are used in your build process.
  * `session` Electron.Session (optional) - Session which should support
    Chrome extension APIs. `session.defaultSession` is used by default.
  * `createTab(details) => Promise<[Electron.WebContents, Electron.BrowserWindow]>` (optional) -
    Called when `chrome.tabs.create` is invoked by an extension. Allows the
    application to handle how tabs are created.
    * `details` [chrome.tabs.CreateProperties](https://developer.chrome.com/docs/extensions/reference/tabs/#method-create)
  * `selectTab(webContents, browserWindow)` (optional) - Called when
    `chrome.tabs.update` is invoked by an extension with the option to set the
    active tab.
    * `webContents` Electron.WebContents - The tab to be activated.
    * `browserWindow` Electron.BrowserWindow - The window which owns the tab.
  * `removeTab(webContents, browserWindow)` (optional) - Called when
    `chrome.tabs.remove` is invoked by an extension.
    * `webContents` Electron.WebContents - The tab to be removed.
    * `browserWindow` Electron.BrowserWindow - The window which owns the tab.
  * `createWindow(details) => Promise<Electron.BrowserWindow>`
    (optional) - Called when `chrome.windows.create` is invoked by an extension.
    * `details` [chrome.windows.CreateData](https://developer.chrome.com/docs/extensions/reference/windows/#method-create)
  * `removeWindow(browserWindow) => Promise<Electron.BrowserWindow>`
    (optional) - Called when `chrome.windows.remove` is invoked by an extension.
    * `browserWindow` Electron.BrowserWindow

```ts
new Extensions({
  createTab(details) {
    const tab = myTabApi.createTab()
    if (details.url) {
      tab.webContents.loadURL(details.url)
    }
    return [tab.webContents, tab.browserWindow]
  },
  createWindow(details) {
    const window = new BrowserWindow()
    return window
  }
})
```

For a complete usage example, see the browser implementation in the
[`electron-browser-shell`](https://github.com/samuelmaddock/electron-browser-shell/blob/master/packages/shell/browser/main.js)
project.

#### Instance Methods

##### `extensions.addTab(tab, window)`

- `tab` Electron.WebContents - A tab that the extension system should keep
  track of.
- `window` Electron.BrowserWindow - The window which owns the tab.

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

_Calling this method is not required in Electron >=12._

##### `extensions.removeExtension(extension)`

- `extension` Electron.Extension

Remove an extension tracked by the `chrome.browserAction` API.

_Calling this method is not required in Electron >=12._

#### Instance Events

##### Event: 'browser-action-popup-created'

Returns:

* `popup` PopupView - An instance of the popup.

Emitted when a popup is created by the `chrome.browserAction` API.

### Element: `<browser-action-list>`

The `<browser-action-list>` element provides a row of [browser actions](https://developer.chrome.com/extensions/browserAction) which may be pressed to activate the `chrome.browserAction.onClicked` event or display the extension popup.

To enable the element on a webpage, you must define a preload script which injects the API on specific pages.

#### Attributes

- `partition` string (optional) - The `Electron.Session` partition which extensions are loaded in. Defaults to the session in which `<browser-action-list>` lives.
- `tab` string (optional) - The tab's `Electron.WebContents` ID to use for displaying
  the relevant browser action state. Defaults to the active tab of the current browser window.

#### Browser action example

##### Preload
Inject the browserAction API to make the `<browser-action-list>` element accessible in your application.
```js
import { injectBrowserAction } from 'electron-chrome-extensions/dist/browser-action'

// Inject <browser-action-list> element into our page
if (location.href === 'webui://browser-chrome.html') {
  injectBrowserAction()
}
```

> The use of `import` implies that your preload script must be compiled using a JavaScript bundler like Webpack.

##### Webpage
Add the `<browser-action-list>` element with attributes appropriate for your application.
```html
<!-- Show actions for the same session and active tab of current window. -->
<browser-action-list></browser-action-list>

<!-- Show actions for custom session and active tab of current window. -->
<browser-action-list partition="persist:custom"></browser-action-list>

<!-- Show actions for custom session and a specific tab of current window. -->
<browser-action-list partition="persist:custom" tab="1"></browser-action-list>
```

## Supported `chrome.*` APIs

The following APIs are supported, in addition to [those already built-in to Electron.](https://www.electronjs.org/docs/api/extensions)

Although certain APIs may not be implemented, some methods and properties are still defined as noops.

<details>
<summary>Click to reveal supported APIs</summary>

### [`chrome.browserAction`](https://developer.chrome.com/extensions/browserAction)

- [x] chrome.browserAction.setTitle
- [x] chrome.browserAction.getTitle
- [x] chrome.browserAction.setIcon
- [x] chrome.browserAction.setPopup
- [x] chrome.browserAction.getPopup
- [x] chrome.browserAction.setBadgeText
- [x] chrome.browserAction.getBadgeText
- [x] chrome.browserAction.setBadgeBackgroundColor
- [x] chrome.browserAction.getBadgeBackgroundColor
- [ ] chrome.browserAction.enable
- [ ] chrome.browserAction.disable
- [x] chrome.browserAction.onClicked

### [`chrome.cookies`](https://developer.chrome.com/extensions/cookies)

- [x] chrome.cookies.get
- [x] chrome.cookies.getAll
- [x] chrome.cookies.set
- [x] chrome.cookies.remove
- [x] chrome.cookies.getAllCookieStores
- [ ] chrome.cookies.onChanged

### [`chrome.contextMenus`](https://developer.chrome.com/extensions/contextMenus)

- [x] chrome.contextMenus.create
- [ ] chrome.contextMenus.update
- [x] chrome.contextMenus.remove
- [x] chrome.contextMenus.removeAll
- [x] chrome.contextMenus.onClicked

### [`chrome.notifications`](https://developer.chrome.com/extensions/notifications)

- [x] chrome.notifications.clear
- [x] chrome.notifications.create
- [x] chrome.notifications.getAll
- [x] chrome.notifications.getPermissionLevel
- [x] chrome.notifications.update
- [ ] chrome.notifications.onButtonClicked
- [x] chrome.notifications.onClicked
- [x] chrome.notifications.onClosed

See [Electron's Notification tutorial](https://www.electronjs.org/docs/tutorial/notifications) for how to support them in your app.

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

### [`chrome.storage`](https://developer.chrome.com/extensions/storage)

- [x] chrome.storage.local
- [x] chrome.storage.managed - fallback to `local`
- [x] chrome.storage.sync - fallback to `local`

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

- [x] chrome.webNavigation.getFrame (Electron 12+)
- [x] chrome.webNavigation.getAllFrames (Electron 12+)
- [x] chrome.webNavigation.onBeforeNavigate
- [x] chrome.webNavigation.onCommitted
- [x] chrome.webNavigation.onDOMContentLoaded
- [x] chrome.webNavigation.onCompleted
- [ ] chrome.webNavigation.onErrorOccurred
- [x] chrome.webNavigation.onCreateNavigationTarget
- [ ] chrome.webNavigation.onReferenceFragmentUpdated
- [ ] chrome.webNavigation.onTabReplaced
- [x] chrome.webNavigation.onHistoryStateUpdated

### [`chrome.windows`](https://developer.chrome.com/extensions/windows)

- [x] chrome.windows.get
- [x] chrome.windows.getCurrent
- [x] chrome.windows.getLastFocused
- [x] chrome.windows.getAll
- [x] chrome.windows.create
- [x] chrome.windows.update
- [x] chrome.windows.remove
- [x] chrome.windows.onCreated
- [x] chrome.windows.onRemoved
- [x] chrome.windows.onFocusChanged
- [ ] chrome.windows.onBoundsChanged
</details>

## Limitations

### electron-chrome-extensions
- Electron v11 is recommended. Minimum support requires Electron v9.
- Chrome's Manifest V3 extensions are not yet supported.

### electron
- Usage of Electron's `webRequest` API will prevent `chrome.webRequest` listeners from being called.
- Chrome extensions are not supported in non-persistent/incognito sessions.
- `chrome.webNavigation.onDOMContentLoaded` is only emitted for the top frame until [support for iframes](https://github.com/electron/electron/issues/27344) is added.

## License

GPL-3

For proprietary use, please [contact me](mailto:sam@samuelmaddock.com?subject=electron-chrome-extensions%20license) or [sponsor me on GitHub](https://github.com/sponsors/samuelmaddock/) under the appropriate tier to [acquire a proprietary-use license](https://github.com/samuelmaddock/electron-browser-shell/blob/master/LICENSE-PATRON.md). These contributions help make development and maintenance of this project more sustainable and show appreciation for the work thus far.
