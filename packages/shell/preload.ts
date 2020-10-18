import { injectBrowserAction } from 'electron-chrome-extensions/dist/browser-action'

// Inject <browser-action-list> element into WebUI
if (location.href === 'chrome-extension://dccfhlfehaklnoehghigjkhnbopfjeeo/webui.html') {
  injectBrowserAction()
}
