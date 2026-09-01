import { ExtensionContext } from '../context'
import { ExtensionEvent } from '../router'

/**
 * In-memory implementation of chrome.storage.session for MV3 extensions.
 * Data is stored per-extension in the main process so it:
 * - Persists across service worker restarts
 * - Is shared between all extension contexts (background, content scripts, popup)
 * - Is cleared when the extension is unloaded or the browser quits
 */
export class StorageAPI {
  /** Per-extension session storage: extensionId -> key -> value */
  private sessionData = new Map<string, Record<string, any>>()

  constructor(private ctx: ExtensionContext) {
    const handle = this.ctx.router.apiHandler()

    handle('storage.session.clear', this.sessionClear)
    handle('storage.session.get', this.sessionGet)
    handle('storage.session.getBytesInUse', this.sessionGetBytesInUse)
    handle('storage.session.getKeys', this.sessionGetKeys)
    handle('storage.session.remove', this.sessionRemove)
    handle('storage.session.set', this.sessionSet)
    handle('storage.session.setAccessLevel', this.sessionSetAccessLevel)

    const sessionExtensions = ctx.session.extensions || ctx.session
    sessionExtensions.on('extension-unloaded', (_event, extension) => {
      this.sessionData.delete(extension.id)
    })
  }

  private getStore(extensionId: string): Record<string, any> {
    let store = this.sessionData.get(extensionId)
    if (!store) {
      store = {}
      this.sessionData.set(extensionId, store)
    }
    return store
  }

  private sessionClear = ({ extension }: ExtensionEvent) => {
    const store = this.getStore(extension.id)
    const changes: Record<string, any> = {}

    for (const [key, value] of Object.entries(store)) {
      changes[key] = { oldValue: value }
    }
    this.sessionData.set(extension.id, {})

    if (Object.keys(changes).length > 0) {
      this.ctx.router.broadcastEvent('storage.session.onChanged', changes)
    }
  }

  private sessionGet = ({ extension }: ExtensionEvent, keys: any) => {
    const store = this.getStore(extension.id)
    const result: Record<string, any> = {}

    const keyList =
      keys == null
        ? Object.keys(store)
        : typeof keys === 'string'
          ? [keys]
          : Array.isArray(keys)
            ? keys
            : Object.keys(keys)

    for (const key of keyList) {
      if (key in store) {
        result[key] = store[key]
      } else if (keys && typeof keys === 'object' && !Array.isArray(keys) && key in keys) {
        result[key] = keys[key]
      }
    }

    return result
  }

  private sessionGetBytesInUse = ({ extension }: ExtensionEvent) => {
    const store = this.getStore(extension.id)
    return Object.keys(store).reduce((acc, key) => {
      return acc + key.length + JSON.stringify(store[key]).length
    }, 0)
  }

  private sessionGetKeys = ({ extension }: ExtensionEvent) => {
    const store = this.getStore(extension.id)
    return Object.keys(store)
  }

  private sessionRemove = ({ extension }: ExtensionEvent, keys: string | string[]) => {
    const store = this.getStore(extension.id)
    const keyList = typeof keys === 'string' ? [keys] : keys
    const changes: Record<string, any> = {}

    for (const key of keyList) {
      if (key in store) {
        changes[key] = { oldValue: store[key] }
        delete store[key]
      }
    }

    if (Object.keys(changes).length > 0) {
      this.ctx.router.broadcastEvent('storage.session.onChanged', changes)
    }
  }

  private sessionSet = ({ extension }: ExtensionEvent, items: Record<string, any>) => {
    const store = this.getStore(extension.id)
    const changes: Record<string, any> = {}

    for (const [key, value] of Object.entries(items)) {
      const oldValue = store[key]
      store[key] = value
      changes[key] = { newValue: value, ...(oldValue !== undefined && { oldValue }) }
    }

    if (Object.keys(changes).length > 0) {
      this.ctx.router.broadcastEvent('storage.session.onChanged', changes)
    }
  }

  private sessionSetAccessLevel = () => {
    // No-op
  }
}
