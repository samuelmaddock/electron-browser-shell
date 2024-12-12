import { injectExtensionAPIs } from './renderer'

// Only load within extension page context
// TODO(mv3): remove any
if ((process as any).type === 'service-worker' || location.href.startsWith('chrome-extension://')) {
  injectExtensionAPIs()
}
