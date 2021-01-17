# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[3.0.0]: https://github.com/samuelmaddock/electron-browser-shell/compare/electron-chrome-extensions@2.1.0...electron-chrome-extensions@3.0.0