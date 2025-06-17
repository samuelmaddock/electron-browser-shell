# electron-chrome-extensions

> Chrome extension API support for Electron.

Electron provides [basic support for Chrome extensions](https://www.electronjs.org/docs/api/extensions) out of the box. However, it only supports a subset of APIs with a focus on DevTools. Concepts like tabs, popups, and extension actions aren't known to Electron.

This library aims to bring extension support in Electron up to the level you'd come to expect from a browser like Google Chrome. API behavior is customizable so you can define how to handle things like tab or window creation specific to your application's needs.

## Install

```
npm install electron-chrome-extensions
```

## Screenshots

| uBlock Origin                                                                                                                                                          | Dark Reader                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="https://raw.githubusercontent.com/samuelmaddock/electron-browser-shell/master/packages/electron-chrome-extensions/screenshot-ublock-origin.png" width="405"> | <img src="https://raw.githubusercontent.com/samuelmaddock/electron-browser-shell/master/packages/electron-chrome-extensions/screenshot-dark-reader.png" width="391"> |

## Usage

### Basic

Simple browser using Electron's [default session](https://www.electronjs.org/docs/api/session#sessiondefaultsession) and one tab.

```js
const { app, BrowserWindow } = require('electron')
const { ElectronChromeExtensions } = require('electron-chrome-extensions')

app.whenReady().then(() => {
  const extensions = new ElectronChromeExtensions()
  const browserWindow = new BrowserWindow()

  // Adds the active tab of the browser
  extensions.addTab(browserWindow.webContents, browserWindow)

  browserWindow.loadURL('https://samuelmaddock.com')
  browserWindow.show()
})
```

### Advanced

Multi-tab browser with full support for Chrome extension APIs.

> For a complete example, see the [`electron-browser-shell`](https://github.com/samuelmaddock/electron-browser-shell) project.

```js
const { app, session, BrowserWindow } = require('electron')
const { ElectronChromeExtensions } = require('electron-chrome-extensions')

app.whenReady().then(() => {
  const browserSession = session.fromPartition('persist:custom')

  const extensions = new ElectronChromeExtensions({
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
    },
    removeWindow(browserWindow) {
      // Optionally implemented for chrome.windows.remove support
    },
    requestPermissions(extension, permissions) {
      // Optionally implemented for chrome.permissions.request support
    },
  })

  const browserWindow = new BrowserWindow({
    webPreferences: {
      // Use same session given to Extensions class
      session: browserSession,
      // Required for extension preload scripts
      sandbox: true,
      // Recommended for loading remote content
      contextIsolation: true,
    },
  })

  // Adds the active tab of the browser
  extensions.addTab(browserWindow.webContents, browserWindow)

  browserWindow.loadURL('https://samuelmaddock.com')
  browserWindow.show()
})
```

### Packaging the preload script

This module uses a [preload script](https://www.electronjs.org/docs/latest/tutorial/tutorial-preload#what-is-a-preload-script).
When packaging your application, it's required that the preload script is included. This can be
handled in two ways:

1. Include `node_modules` in your packaged app. This allows `electron-chrome-extensions/preload` to
   be resolved.
2. In the case of using JavaScript bundlers, you may need to copy the preload script next to your
   app's entry point script. You can try using
   [copy-webpack-plugin](https://github.com/webpack-contrib/copy-webpack-plugin),
   [vite-plugin-static-copy](https://github.com/sapphi-red/vite-plugin-static-copy),
   or [rollup-plugin-copy](https://github.com/vladshcherbin/rollup-plugin-copy) depending on your app's
   configuration.

Here's an example for webpack configurations:

```js
module.exports = {
  entry: './index.js',
  plugins: [
    new CopyWebpackPlugin({
      patterns: [require.resolve('electron-chrome-extensions/preload')],
    }),
  ],
}
```

## API

### Class: ElectronChromeExtensions

> Create main process handler for Chrome extension APIs.

#### `new ElectronChromeExtensions([options])`

- `options` Object
  - `license` String - Distribution license compatible with your application. See LICENSE.md for more details. \
     Valid options include `GPL-3.0`, `Patron-License-2020-11-19`
  - `session` Electron.Session (optional) - Session which should support
    Chrome extension APIs. `session.defaultSession` is used by default.
  - `createTab(details) => Promise<[Electron.WebContents, Electron.BrowserWindow]>` (optional) -
    Called when `chrome.tabs.create` is invoked by an extension. Allows the
    application to handle how tabs are created.
    - `details` [chrome.tabs.CreateProperties](https://developer.chrome.com/docs/extensions/reference/tabs/#method-create)
  - `selectTab(webContents, browserWindow)` (optional) - Called when
    `chrome.tabs.update` is invoked by an extension with the option to set the
    active tab.
    - `webContents` Electron.WebContents - The tab to be activated.
    - `browserWindow` Electron.BrowserWindow - The window which owns the tab.
  - `removeTab(webContents, browserWindow)` (optional) - Called when
    `chrome.tabs.remove` is invoked by an extension.
    - `webContents` Electron.WebContents - The tab to be removed.
    - `browserWindow` Electron.BrowserWindow - The window which owns the tab.
  - `createWindow(details) => Promise<Electron.BrowserWindow>`
    (optional) - Called when `chrome.windows.create` is invoked by an extension.
    - `details` [chrome.windows.CreateData](https://developer.chrome.com/docs/extensions/reference/windows/#method-create)
  - `removeWindow(browserWindow) => Promise<Electron.BrowserWindow>`
    (optional) - Called when `chrome.windows.remove` is invoked by an extension.
    - `browserWindow` Electron.BrowserWindow
  - `assignTabDetails(details, webContents) => void` (optional) - Called when `chrome.tabs` creates
    an object for tab details to be sent to an extension background script. Provide this function to
    assign custom details such as `discarded`, `frozen`, or `groupId`.
    - `details` [chrome.tabs.Tab](https://developer.chrome.com/docs/extensions/reference/api/tabs#type-Tab)
    - `webContents` Electron.WebContents - The tab for which details are being created.

```ts
new ElectronChromeExtensions({
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
  },
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

##### `extensions.getURLOverrides()`

Returns `Object` which maps special URL types to an extension URL. See [chrome_urls_overrides](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/chrome_url_overrides) for a list of
supported URL types.

Example:

```js
{
  newtab: 'chrome-extension://<id>/newtab.html'
}
```

#### Instance Events

##### Event: 'browser-action-popup-created'

Returns:

- `popup` PopupView - An instance of the popup.

Emitted when a popup is created by the `chrome.browserAction` API.

##### Event: 'url-overrides-updated'

Returns:

- `urlOverrides` Object - A map of url types to extension URLs.

Emitted after an extension is loaded with [chrome_urls_overrides](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/chrome_url_overrides) set.

### Element: `<browser-action-list>`

<img src="https://raw.githubusercontent.com/samuelmaddock/electron-browser-shell/master/packages/electron-chrome-extensions/screenshot-browser-action.png" width="438">

The `<browser-action-list>` element provides a row of [browser actions](https://developer.chrome.com/extensions/browserAction) which may be pressed to activate the `chrome.browserAction.onClicked` event or display the extension popup.

To enable the element on a webpage, you must define a preload script which injects the API on specific pages.

#### Attributes

- `partition` string (optional) - The `Electron.Session` partition which extensions are loaded in. Defaults to the session in which `<browser-action-list>` lives.
- `tab` string (optional) - The tab's `Electron.WebContents` ID to use for displaying
  the relevant browser action state. Defaults to the active tab of the current browser window.
- `alignment` string (optional) - How the popup window should be aligned relative to the extension action. Defaults to `bottom left`. Use any assortment of `top`, `bottom`, `left`, and `right`.

#### Browser action example

##### Preload

Inject the browserAction API to make the `<browser-action-list>` element accessible in your application.

```js
import { injectBrowserAction } from 'electron-chrome-extensions/browser-action'

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

<!-- If extensions are displayed in the bottom left of your browser UI, then
     you can align the popup to the top right of the extension action. -->
<browser-action-list alignment="top right"></browser-action-list>
```

##### Main process

For extension icons to appear in the list, the `crx://` protocol needs to be handled in the Session
where it's intended to be displayed.

```js
import { app, session } from 'electron'
import { ElectronChromeExtensions } from 'electron-chrome-extensions'

app.whenReady().then(() => {
  // Provide the session where your app will display <browser-action-list>
  const appSession = session.defaultSession
  ElectronChromeExtensions.handleCRXProtocol(appSession)
})
```

##### Custom CSS

The `<browser-action-list>` element is a [Web Component](https://developer.mozilla.org/en-US/docs/Web/Web_Components). Its styles are encapsulated within a [Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM). However, it's still possible to customize its appearance using the [CSS shadow parts](https://developer.mozilla.org/en-US/docs/Web/CSS/::part) selector `::part(name)`.

Accessible parts include `action` and `badge`.

```css
/* Layout action buttons vertically. */
browser-action-list {
  flex-direction: column;
}

/* Modify size of action buttons. */
browser-action-list::part(action) {
  width: 16px;
  height: 16px;
}

/* Modify hover styles of action buttons. */
browser-action-list::part(action):hover {
  background-color: red;
  border-radius: 0;
}
```

## Supported `chrome.*` APIs

The following APIs are supported, in addition to [those already built-in to Electron.](https://www.electronjs.org/docs/api/extensions)

<details>
<summary>Click to reveal supported APIs</summary>

### [`chrome.action`](https://developer.chrome.com/extensions/action)

- [x] chrome.action.setTitle
- [x] chrome.action.getTitle
- [x] chrome.action.setIcon
- [x] chrome.action.setPopup
- [x] chrome.action.getPopup
- [x] chrome.action.setBadgeText
- [x] chrome.action.getBadgeText
- [x] chrome.action.setBadgeBackgroundColor
- [x] chrome.action.getBadgeBackgroundColor
- [ ] chrome.action.enable
- [ ] chrome.action.disable
- [x] chrome.action.openPopup
- [x] chrome.action.onClicked

### [`chrome.commands`](https://developer.chrome.com/extensions/commands)

- [ ] chrome.commands.getAll
- [ ] chrome.commands.onCommand

### [`chrome.cookies`](https://developer.chrome.com/extensions/cookies)

- [x] chrome.cookies.get
- [x] chrome.cookies.getAll
- [x] chrome.cookies.set
- [x] chrome.cookies.remove
- [x] chrome.cookies.getAllCookieStores
- [x] chrome.cookies.onChanged

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

> [!NOTE]
> Electron does not provide tab functionality such as discarded, frozen, or group IDs. If an
> application developer wishes to implement this functionality, emit a `"tab-updated"` event on the
> tab's WebContents for `chrome.tabs.onUpdated` to be made aware of changes. Tab properties can be
> assigned using the `assignTabDetails` option provided to the `ElectronChromeExtensions`
> constructor.

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
- [x] chrome.windows.onBoundsChanged
</details>

## Limitations

### electron-chrome-extensions

- The latest version of Electron is recommended. Minimum support requires Electron v35.0.0-beta.8.
- All background scripts are persistent.

### electron

- Usage of Electron's `webRequest` API will prevent `chrome.webRequest` listeners from being called.
- Chrome extensions are not supported in non-persistent/incognito sessions.
- `chrome.webNavigation.onDOMContentLoaded` is only emitted for the top frame until [support for iframes](https://github.com/electron/electron/issues/27344) is added.
- Service worker preload scripts require Electron's sandbox to be enabled. This is the default behavior, but might be overridden by the `--no-sandbox` flag or `sandbox: false` in the `webPreferences` of a `BrowserWindow`. Check for the `--no-sandbox` flag using `ps -eaf | grep <appname>`.

## License

GPL-3

For proprietary use, please [contact me](mailto:sam@samuelmaddock.com?subject=electron-chrome-extensions%20license) or [sponsor me on GitHub](https://github.com/sponsors/samuelmaddock/) under the appropriate tier to [acquire a proprietary-use license](https://github.com/samuelmaddock/electron-browser-shell/blob/master/LICENSE-PATRON.md). These contributions help make development and maintenance of this project more sustainable and show appreciation for the work thus far.
