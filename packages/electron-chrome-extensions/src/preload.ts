import { injectExtensionAPIs } from './renderer'

// Only load within extension page context
if ((process as any).type === 'service-worker' || location.href.startsWith('chrome-extension://')) {
  injectExtensionAPIs()
}
