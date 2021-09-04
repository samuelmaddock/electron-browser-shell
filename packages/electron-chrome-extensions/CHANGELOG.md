# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.9.0] - 2021-09-04

### Added

- `chrome.webNavigation.onDOMContentLoaded` for iframes—`electron@15.0.0-beta.2` required.

### Changed

- Reduced IPC traffic for updated extension icons.

### Fixed

- `chrome.contextMenus.onClicked` callback was never invoked.
- `partition` of `<browser-action-list>` would error when a remote session partition was set.

## [3.8.0] - 2021-06-14

### Added

- `chrome.cookies.onChanged`
- `chrome.extension.isAllowedIncognitoAccess`

### Changed

- Extension background scripts now subscribe to API events to cut down on IPC traffic.
- `selectTab()` from the `ElectronChromeExtensions` constructor options is now called when the Chrome extensions API sets the active tab.

## [3.7.0] - 2021-06-05

### Added

- Exposed `action` and `badge` CSS shadow parts for customizing `<browser-action-list>` element.

### Fixed

- Calling `ElectronChromeExtensions.getContextMenuItems()` threw an error when no `browser_action` was defined in an extension's manifest file.

## [3.6.1] - 2021-06-05

### Added

- Included license files in NPM package.

## [3.6.0] - 2021-05-20

### Added

- Initial `chrome.contextMenu` support when right-clicking browser actions.
- Support `chrome.contextMenu` entries with `parentId` set.
- Added `ElectronChromeExtensions.fromSession()` to get an existing instance.

### Changed

- Renamed `Extensions` class to `ElectronChromeExtensions`.

### Fixed

- Disabled `chrome.contextMenu` items now appear disabled instead of being hidden.

## [3.5.0] - 2021-05-09

### Added

- Stubbed `chrome.commands` methods.

### Fixed

- Browser action popup not using `browserAction.setPopup()` value.

## [3.4.0] - 2021-04-07

### Added

- Added `Extensions.removeExtension(extension)`.

### Changed

- Improvements to the browser action styles.

### Fixed

- Errors being thrown in Electron 12 when `'extension-unloaded'` is emitted.

## [3.3.0] - 2021-02-10

### Added

- `<browser-action-list>` now supports custom sessions which can be set using the `partition` attribute.

### Changed

- `<browser-action-list>`'s `tab` attribute is now optional and will use the active tab by default.

### Fixed

- Fixed `browser-action-list` badge text not updating after being removed.

## [3.2.0] - 2021-02-07

### Added

- Added `modulePath` option to `Extensions` constructor.

## [3.1.1] - 2021-01-27

### Fixed

- Fix `browser-action-list` API not working when `contextIsolation` is disabled.

## [3.1.0] - 2021-01-24

### Added

- Basic `chrome.notifications` support
- `chrome.browserAction.onClicked`
- `chrome.tabs.executeScript` for the active tab
- `chrome.webNavigation.onBeforeNavigate`, `chrome.webNavigation.onDOMContentLoaded`, `chrome.webNavigation.onCompleted`
- `chrome.webNavigation.getFrame` and `chrome.webNavigation.getAllFrames` (Electron 12+)

## [3.0.0] - 2021-01-15

### Added 

- Most of `chrome.cookies`
- Most of `chrome.windows`
- `chrome.tabs.getAllInWindow`
- `chrome.webNavigation.getAllFrames`
- `chrome.storage` now uses `local` as a fallback for `sync` and `managed`
  which aren't currently supported by Electron.
- Basic hover style for `<browser-action-list>` items.

### Changed

- BREAKING: Replace `event` object passed into `Extensions` constructor option.
  functions with an instance of the tab's `BrowserWindow` owner.

### Fixed

- Extension action popups now resize appropriately in electron@12.x.y.

[3.9.0]: https://github.com/samuelmaddock/electron-browser-shell/compare/electron-chrome-extensions@3.8.0...electron-chrome-extensions@3.9.0
[3.8.0]: https://github.com/samuelmaddock/electron-browser-shell/compare/electron-chrome-extensions@3.7.0...electron-chrome-extensions@3.8.0
[3.7.0]: https://github.com/samuelmaddock/electron-browser-shell/compare/electron-chrome-extensions@3.6.1...electron-chrome-extensions@3.7.0
[3.6.1]: https://github.com/samuelmaddock/electron-browser-shell/compare/electron-chrome-extensions@3.6.0...electron-chrome-extensions@3.6.1
[3.6.0]: https://github.com/samuelmaddock/electron-browser-shell/compare/electron-chrome-extensions@3.5.0...electron-chrome-extensions@3.6.0
[3.5.0]: https://github.com/samuelmaddock/electron-browser-shell/compare/electron-chrome-extensions@3.4.0...electron-chrome-extensions@3.5.0
[3.4.0]: https://github.com/samuelmaddock/electron-browser-shell/compare/electron-chrome-extensions@3.3.0...electron-chrome-extensions@3.4.0
[3.3.0]: https://github.com/samuelmaddock/electron-browser-shell/compare/electron-chrome-extensions@3.2.0...electron-chrome-extensions@3.3.0
[3.2.0]: https://github.com/samuelmaddock/electron-browser-shell/compare/electron-chrome-extensions@3.1.1...electron-chrome-extensions@3.2.0
[3.1.1]: https://github.com/samuelmaddock/electron-browser-shell/compare/electron-chrome-extensions@3.0.1...electron-chrome-extensions@3.1.1
[3.1.0]: https://github.com/samuelmaddock/electron-browser-shell/compare/electron-chrome-extensions@3.0.0...electron-chrome-extensions@3.1.0
[3.0.0]: https://github.com/samuelmaddock/electron-browser-shell/compare/electron-chrome-extensions@2.1.0...electron-chrome-extensions@3.0.0
