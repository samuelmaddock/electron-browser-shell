import { injectExtensionAPIs } from './renderer'

// Only load within extension page context
if (location.href.startsWith('chrome-extension://')) {
  injectExtensionAPIs()
}
