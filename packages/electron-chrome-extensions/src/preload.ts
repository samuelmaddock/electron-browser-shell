import { injectExtensionAPIs } from './renderer'

// Only load within extension page context
if (process.type === 'service-worker' || location.href.startsWith('chrome-extension://')) {
  injectExtensionAPIs()
}
