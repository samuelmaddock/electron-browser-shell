import { injectBrowserAction } from 'electron-chrome-extensions/dist/browser-action'

// Inject <browser-action-list> element into WebUI
if (location.protocol === 'chrome-extension:' && location.pathname === '/webui.html') {
  injectBrowserAction()
}
