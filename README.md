# electron-browser-shell

A bare-bones, tabbed web browser with support for Chrome extensions—built on Electron.

This is a WIP testbed for development of Chrome extension support in Electron. Minimal dependencies are used as a means to allow developers to take what they need for their own projects.

![browser preview image showing 3 tabs and a youtube video](./screenshot.png)

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

## Contributor license agreement

By sending a pull request, you hereby grant to owners and users of the
electron-browser-shell project a perpetual, worldwide, non-exclusive,
no-charge, royalty-free, irrevocable copyright license to reproduce, prepare
derivative works of, publicly display, publicly perform, sublicense, and
distribute your contributions and such derivative works.

The owners of the electron-browser-shell project will also be granted the right to relicense the
contributed source code and its derivative works.
