import { injectExtensionAPIs } from './renderer'

// Only load within extension page context
if ((process as any).type === 'preload_realm' || location.href.startsWith('chrome-extension://')) {
  injectExtensionAPIs()
}
