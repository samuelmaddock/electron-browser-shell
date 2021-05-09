import { ExtensionStore } from '../store'

/**
 * Stub implementation for chrome.commands API.
 */
export class CommandsAPI {
  constructor(private store: ExtensionStore) {
    store.handle('commands.getAll', this.getAll)
  }

  getAll() {
    return []
  }
}
