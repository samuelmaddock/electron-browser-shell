import { app, Extension, ipcMain, Menu, MenuItem } from 'electron'
import { MenuItemConstructorOptions } from 'electron/main'
import { ExtensionEvent } from '../router'
import { ExtensionStore } from '../store'
import { getIconImage, matchesPattern } from './common'

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

const DEFAULT_CONTEXTS = ['page']

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

const formatTitle = (title: string, params: Electron.ContextMenuParams) => {
  if (params.selectionText && title.includes('%s')) {
    title = title.split('%s').join(params.selectionText)
  }
  return title
}

export class ContextMenusAPI {
  private menus = new Map<
    /* extensionId */ string,
    Map</* menuItemId */ string, ContextItemProps>
  >()

  constructor(private store: ExtensionStore) {
    store.handle('contextMenus.create', this.create)
    store.handle('contextMenus.remove', this.remove)
    store.handle('contextMenus.removeAll', this.removeAll)

    // TODO: remove 'any' when project is upgraded to Electron 12
    this.store.session.on('extension-unloaded' as any, (event, extension: any) => {
      if (this.menus.has(extension.id)) {
        this.menus.delete(extension.id)
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

  buildMenuItems(webContents: Electron.WebContents, params: Electron.ContextMenuParams) {
    const buildMenuItem = (extension: Electron.Extension, props: ContextItemProps) => {
      // TODO: try to get the appropriately sized image before resizing
      let icon = getIconImage(extension)
      if (icon) {
        icon = icon.resize({ width: 16, height: 16 })
      }

      const menuItemOptions: MenuItemConstructorOptions = {
        id: props.id,
        type: props.type as any,
        label: formatTitle(props.title || '', params),
        icon,
        click: () => {
          this.onClicked(extension.id, props.id!, params, webContents)
        },
      }
      const menuItem = new MenuItem(menuItemOptions)
      return menuItem
    }

    const matchesConditions = (props: ContextItemProps) => {
      if (props.enabled === false) return false

      const contexts = props.contexts || DEFAULT_CONTEXTS
      const contextTypes = getContextTypesFromParams(params)
      const inContext = contexts.some((context) => contextTypes.has(context as ContextType))
      if (!inContext) return false

      const targetUrl = params.srcURL || params.linkURL
      if (props.targetUrlPatterns && props.targetUrlPatterns.length > 0 && targetUrl) {
        if (!props.targetUrlPatterns.some((pattern) => matchesPattern(pattern, targetUrl))) {
          return false
        }
      }

      const documentUrl = params.frameURL || params.pageURL
      if (props.documentUrlPatterns && props.documentUrlPatterns.length > 0) {
        if (!props.documentUrlPatterns.some((pattern) => matchesPattern(pattern, documentUrl))) {
          return false
        }
      }

      return true
    }

    const menuItems = []

    for (const [extensionId, propItems] of this.menus) {
      const extension = this.store.session.getExtension(extensionId)
      if (!extension) continue

      for (const [, props] of propItems) {
        if (matchesConditions(props)) {
          const menuItem = buildMenuItem(extension, props)
          menuItems.push(menuItem)
        }
      }
    }

    return menuItems
  }

  private create = ({ extension }: ExtensionEvent, createProperties: ContextItemProps) => {
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
      this.addContextItem(extension.id, createProperties)
    }
  }

  private remove = ({ extension }: ExtensionEvent, menuItemId: string) => {
    const items = this.menus.get(extension.id)
    if (items && items.has(menuItemId)) {
      items.delete(menuItemId)
      if (items.size === 0) {
        this.menus.delete(extension.id)
      }
    }
  }

  private removeAll = ({ extension }: ExtensionEvent) => {
    this.menus.delete(extension.id)
  }

  private onClicked(
    extensionId: string,
    menuItemId: string,
    params: Electron.ContextMenuParams,
    webContents: Electron.WebContents
  ) {
    if (webContents.isDestroyed()) return

    const tab = this.store.tabDetailsCache.get(webContents.id)
    if (!tab) {
      throw new Error(`[Extensions] Unable to find tab for id=${webContents.id}`)
    }

    const data: chrome.contextMenus.OnClickData = {
      selectionText: params.selectionText,
      checked: false, // TODO
      menuItemId,
      frameId: -1, // TODO: match frameURL with webFrameMain in Electron 12
      frameUrl: params.frameURL,
      editable: params.isEditable,
      mediaType: params.mediaType,
      wasChecked: false, // TODO
      pageUrl: params.pageURL,
      linkUrl: params.linkURL,
      parentMenuItemId: -1, // TODO
      srcUrl: params.srcURL,
    }

    this.store.sendToExtensionHost(extensionId, 'contextMenus.onClicked', data, tab)
  }
}
