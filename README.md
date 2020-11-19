# electron-browser-shell

A minimal, tabbed web browser with support for Chrome extensions—built on Electron.

![browser preview image showing 3 tabs and a youtube video](./screenshot.png)

## Packages

| Name | Description |
| --- | --- |
| [shell](./packages/shell) | A minimal, tabbed web browser used as a testbed for development of Chrome extension support. |
| [electron-chrome-extensions](./packages/electron-chrome-extensions) | Adds additional API support for Chrome extensions to Electron. |

## Usage

```bash
# Get the code
git clone git@github.com:samuelmaddock/electron-browser-shell.git
cd electron-browser-shell

# Install and launch the browser
yarn
yarn start
```

### Install extensions

Load unpacked extensions into `./extensions` then launch the browser.

## Roadmap

- [x] Browser tabs
- [x] Unpacked extension loader
- [x] Initial [`chrome.tabs` extensions API](https://developer.chrome.com/extensions/tabs)
- [x] Initial [extension popup](https://developer.chrome.com/extensions/browserAction) support
- [ ] Full support of [`chrome.*` extensions APIs](https://developer.chrome.com/extensions/devguide)
- [ ] Robust extension popup support
- [ ] Chrome webstore extension installer?

## License

GPL-3

For proprietary use, please [contact me](mailto:sam@samuelmaddock.com?subject=electron-browser-shell%20license) or [sponsor me on GitHub](https://github.com/sponsors/samuelmaddock/) under the appropriate tier to [acquire a proprietary-use license](https://github.com/samuelmaddock/electron-browser-shell/blob/master/LICENSE-PATRON.md). These contributions help make development and maintenance of this project more sustainable and show appreciation for the work thus far.

### Contributor license agreement

By sending a pull request, you hereby grant to owners and users of the
electron-browser-shell project a perpetual, worldwide, non-exclusive,
no-charge, royalty-free, irrevocable copyright license to reproduce, prepare
derivative works of, publicly display, publicly perform, sublicense, and
distribute your contributions and such derivative works.

The owners of the electron-browser-shell project will also be granted the right to relicense the
contributed source code and its derivative works.
