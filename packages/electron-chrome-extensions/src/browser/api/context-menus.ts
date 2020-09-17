import { ipcMain } from 'electron'
import { EventEmitter } from 'events'

export class ContextMenusAPI extends EventEmitter {
  private menus = new Map</* extensionId */ string, any>()

  constructor() {
    super()

    ipcMain.handle('contextMenus.create', this.create)
  }

  private addContextItem(extensionId: string, item: any) {
    let contextItems = this.menus.get(extensionId)
    if (!contextItems) {
      contextItems = []
      this.menus.set(extensionId, contextItems)
    }
    contextItems.push(item)
  }

  private create = (
    event: Electron.IpcMainInvokeEvent,
    extensionId: string,
    createProperties: chrome.contextMenus.CreateProperties
  ) => {
    const { id, type, title } = createProperties

    if (this.menus.has(id!)) {
      // TODO: duplicate error
      return
    }

    if (!title && type !== 'separator') {
      // TODO: error
      return
    }

    if (createProperties.parentId) {
      // TODO
    } else {
      this.addContextItem(extensionId, createProperties)
    }
  }
}
