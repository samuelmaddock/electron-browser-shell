import { ipcMain } from 'electron'
import { EventEmitter } from 'events'
import { ExtensionEvent } from '../router'
import { ExtensionStore } from '../store'

export class RuntimeAPI extends EventEmitter {
  constructor(private store: ExtensionStore) {
    super()
    store.handle('runtime.openOptionsPage', this.openOptionsPage)
  }

  private openOptionsPage = async ({ extension }: ExtensionEvent) => {
    // TODO: options page shouldn't appear in Tabs API
    // https://developer.chrome.com/extensions/options#tabs-api

    const manifest = extension.manifest as chrome.runtime.Manifest

    if (manifest.options_ui) {
      // Embedded option not support (!options_ui.open_in_new_tab)
      const url = `chrome-extension://${extension.id}/${manifest.options_ui.page}`
      await this.store.createTab({ url, active: true })
    } else if (manifest.options_page) {
      const url = `chrome-extension://${extension.id}/${manifest.options_page}`
      await this.store.createTab({ url, active: true })
    }
  }
}
