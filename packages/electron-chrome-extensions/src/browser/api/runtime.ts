import { ipcMain } from 'electron'
import { EventEmitter } from 'events'
import { ExtensionStore } from '../store'

export class RuntimeAPI extends EventEmitter {
  constructor(private store: ExtensionStore) {
    super()
    ipcMain.handle('runtime.openOptionsPage', this.openOptionsPage)
  }

  private openOptionsPage = async (event: Electron.IpcMainInvokeEvent, extensionId: string) => {
    const extension = this.store.session.getExtension(extensionId)
    if (!extension) return

    // TODO: options page shouldn't appear in Tabs API
    // https://developer.chrome.com/extensions/options#tabs-api

    const manifest = extension.manifest as chrome.runtime.Manifest

    if (manifest.options_ui) {
      // Embedded option not support (!options_ui.open_in_new_tab)
      const url = `chrome-extension://${extensionId}/${manifest.options_ui.page}`
      await this.store.createTab(event, { url, active: true })
    } else if (manifest.options_page) {
      const url = `chrome-extension://${extensionId}/${manifest.options_page}`
      await this.store.createTab(event, { url, active: true })
    }
  }
}
