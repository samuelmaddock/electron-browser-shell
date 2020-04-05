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
npm install
npm start
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
