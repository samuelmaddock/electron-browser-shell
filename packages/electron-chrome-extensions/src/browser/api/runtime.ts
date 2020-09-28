import { ipcMain } from 'electron'
import { EventEmitter } from 'events'
import { ExtensionStore } from '../store'

export class RuntimeAPI extends EventEmitter {
  constructor(private store: ExtensionStore) {
    super()
    ipcMain.handle('runtime.openOptionsPage', this.openOptionsPage)
  }

  private openOptionsPage = (event: Electron.IpcMainInvokeEvent, extensionId: string) => {
    const extension = this.store.session.getExtension(extensionId)
    if (!extension) return

    const manifest = extension.manifest as chrome.runtime.Manifest
    const { options_ui } = manifest
    if (!options_ui) return

    // TODO: create tab and navigate to options page
  }
}
