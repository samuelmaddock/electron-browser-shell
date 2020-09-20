import { app, ipcMain, Menu, MenuItem } from 'electron'
import { EventEmitter } from 'events'
import { MenuItemConstructorOptions } from 'electron/main'
import { ExtensionAPIState } from '../api-state'
import { getIconPath } from './common'

type ContextItemProps = chrome.contextMenus.CreateProperties

type ContextType =
  | 'all'
  | 'page'
  | 'frame'
  | 'selection'
  | 'link'
  | 'editable'
  | 'image'
  | 'video'
  | 'audio'
  | 'launcher'
  | 'browser_action'
  | 'page_action'
  | 'action'

const getContextTypesFromParams = (params: Electron.ContextMenuParams): Set<ContextType> => {
  const contexts = new Set<ContextType>(['all'])

  switch (params.mediaType) {
    case 'audio':
    case 'video':
    case 'image':
      contexts.add(params.mediaType)
  }

  if (params.pageURL) contexts.add('page')
  if (params.linkURL) contexts.add('link')
  if (params.frameURL) contexts.add('frame')
  if (params.selectionText) contexts.add('selection')
  if (params.isEditable) contexts.add('editable')

  return contexts
}

export class ContextMenusAPI extends EventEmitter {
  private menus = new Map<
    /* extensionId */ string,
    Map</* menuItemId */ string, ContextItemProps>
  >()

  constructor(private state: ExtensionAPIState) {
    super()

    ipcMain.handle('contextMenus.create', this.create)
    ipcMain.handle('contextMenus.remove', this.remove)
    ipcMain.handle('contextMenus.removeAll', this.removeAll)

    this.state.session.on('extension-unloaded' as any, (event, extensionId) => {
      if (this.menus.has(extensionId)) {
        this.menus.delete(extensionId)
      }
    })
  }

  private addContextItem(extensionId: string, props: ContextItemProps) {
    let contextItems = this.menus.get(extensionId)
    if (!contextItems) {
      contextItems = new Map()
      this.menus.set(extensionId, contextItems)
    }
    contextItems.set(props.id!, props)
  }

  buildMenuItems(params: Electron.ContextMenuParams) {
    const buildMenuItem = (extension: Electron.Extension, props: ContextItemProps) => {
      const menuItemOptions: MenuItemConstructorOptions = {
        id: props.id,
        type: props.type as any,
        label: props.title,
        icon: getIconPath(extension),
        click: () => {
          // TODO
          this.onClicked({} as any, {})
        },
      }
      const menuItem = new MenuItem(menuItemOptions)
      return menuItem
    }

    const menuItems = []
    const contextTypes = getContextTypesFromParams(params)

    for (const [extensionId, propItems] of this.menus) {
      const extension = this.state.session.getExtension(extensionId)
      if (!extension) continue

      for (const [, props] of propItems) {
        if (props.enabled === false) continue

        if (props.contexts) {
          const inContext = props.contexts.some((context) =>
            contextTypes.has(context as ContextType)
          )
          if (!inContext) continue
        }

        const menuItem = buildMenuItem(extension, props)
        menuItems.push(menuItem)
      }
    }

    return menuItems
  }

  private create = (
    event: Electron.IpcMainInvokeEvent,
    extensionId: string,
    createProperties: ContextItemProps
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

  private remove = (
    event: Electron.IpcMainInvokeEvent,
    extensionId: string,
    menuItemId: string
  ) => {
    const items = this.menus.get(extensionId)
    if (items && items.has(menuItemId)) {
      items.delete(menuItemId)
      if (items.size === 0) {
        this.menus.delete(extensionId)
      }
    }
  }

  private removeAll = (event: Electron.IpcMainInvokeEvent, extensionId: string) => {
    this.menus.delete(extensionId)
  }

  private onClicked(info: chrome.contextMenus.OnClickData, tab: any) {
    this.state.sendToHosts('tabs.onCreated', info, tab)
  }
}
