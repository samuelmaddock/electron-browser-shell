# electron-chrome-extensions

> Chrome extension API support for Electron.

## Install

This project is still early in development, and as such, there's no npm module available yet.

## Supported `chrome.*` APIs

The following APIs are supported, in addition to [those already built-in to Electron.](https://www.electronjs.org/docs/api/extensions)

Although certain APIs may not be implemented, some methods and properties are still defined as noops.

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
