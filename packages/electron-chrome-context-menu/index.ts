import { clipboard, Menu, MenuItem } from 'electron'

const STRINGS = {
  openInNewTab: (type: 'link' | Electron.ContextMenuParams['mediaType']) =>
    `Open ${type} in new tab`,
  openInNewWindow: (type: 'link' | Electron.ContextMenuParams['mediaType']) =>
    `Open ${type} in new window`,
  copyAddress: (type: 'link' | Electron.ContextMenuParams['mediaType']) => `Copy ${type} address`,
  undo: 'Undo',
  cut: 'Cut',
  copy: 'Copy',
  delete: 'Delete',
  paste: 'Paste',
  selectAll: 'Select All',
  back: 'Back',
  forward: 'Forward',
  reload: 'Reload',
  inspect: 'Inspect',
}

type ChromeContextMenuStrings = typeof STRINGS

interface ChromeContextMenuOptions {
  /** Context menu parameters emitted from the WebContents 'context-menu' event. */
  params: Electron.ContextMenuParams

  /** WebContents which emitted the 'context-menu' event. */
  webContents: Electron.WebContents

  /** Handler for opening links. */
  openLink: (
    url: string,
    disposition: 'default' | 'foreground-tab' | 'background-tab' | 'new-window',
    params: Electron.ContextMenuParams
  ) => void

  /** Chrome extension menu items. */
  extensionMenuItems?: MenuItem[]

  /** Strings used to create menu items. Replace this if localization is needed. */
  strings?: ChromeContextMenuStrings
}

const buildChromeContextMenu = ({
  params,
  webContents,
  openLink,
  extensionMenuItems,
  strings = STRINGS,
}: ChromeContextMenuOptions): Menu => {
  const menu = new Menu()

  if (params.linkURL) {
    menu.append(
      new MenuItem({
        label: strings.openInNewTab('link'),
        click: () => {
          openLink(params.linkURL, 'default', params)
        },
      })
    )
    menu.append(
      new MenuItem({
        label: strings.openInNewWindow('link'),
        click: () => {
          openLink(params.linkURL, 'new-window', params)
        },
      })
    )
    menu.append(new MenuItem({ type: 'separator' }))
    menu.append(
      new MenuItem({
        label: strings.copyAddress('link'),
        click: () => {
          clipboard.writeText(params.linkURL)
        },
      })
    )
    menu.append(new MenuItem({ type: 'separator' }))
  } else if (params.mediaType !== 'none') {
    // TODO: Loop, Show controls
    menu.append(
      new MenuItem({
        label: strings.openInNewTab(params.mediaType),
        click: () => {
          openLink(params.srcURL, 'default', params)
        },
      })
    )
    menu.append(
      new MenuItem({
        label: strings.copyAddress(params.mediaType),
        click: () => {
          clipboard.writeText(params.srcURL)
        },
      })
    )
    menu.append(new MenuItem({ type: 'separator' }))
  }

  if (params.isEditable) {
    menu.append(
      new MenuItem({
        label: strings.undo,
        enabled: params.editFlags.canUndo,
        click: () => webContents.undo(),
      })
    )
    menu.append(new MenuItem({ type: 'separator' }))
    menu.append(
      new MenuItem({
        label: strings.cut,
        enabled: params.editFlags.canCut,
        click: () => webContents.cut(),
      })
    )
    menu.append(
      new MenuItem({
        label: strings.copy,
        enabled: params.editFlags.canCopy,
        click: () => webContents.copy(),
      })
    )
    menu.append(
      new MenuItem({
        label: strings.paste,
        enabled: params.editFlags.canPaste,
        click: () => webContents.paste(),
      })
    )
    menu.append(
      new MenuItem({
        label: strings.delete,
        enabled: params.editFlags.canDelete,
        click: () => webContents.delete(),
      })
    )
    menu.append(new MenuItem({ type: 'separator' }))
    if (params.editFlags.canSelectAll) {
      menu.append(
        new MenuItem({
          label: strings.selectAll,
          click: () => webContents.selectAll(),
        })
      )
      menu.append(new MenuItem({ type: 'separator' }))
    }
  } else if (params.selectionText) {
    menu.append(
      new MenuItem({
        label: strings.copy,
        click: () => {
          clipboard.writeText(params.selectionText)
        },
      })
    )
    menu.append(new MenuItem({ type: 'separator' }))
  }

  if (menu.items.length === 0) {
    menu.append(
      new MenuItem({
        label: strings.back,
        enabled: webContents.canGoBack(),
        click: () => webContents.goBack(),
      })
    )
    menu.append(
      new MenuItem({
        label: strings.forward,
        enabled: webContents.canGoForward(),
        click: () => webContents.goForward(),
      })
    )
    menu.append(
      new MenuItem({
        label: strings.reload,
        click: () => webContents.reload(),
      })
    )
    menu.append(new MenuItem({ type: 'separator' }))
  }

  if (extensionMenuItems) {
    extensionMenuItems.forEach((item) => menu.append(item))
    if (extensionMenuItems.length > 0) menu.append(new MenuItem({ type: 'separator' }))
  }

  menu.append(
    new MenuItem({
      label: strings.inspect,
      click: () => webContents.openDevTools(),
    })
  )

  return menu
}

module.exports = buildChromeContextMenu
module.exports.default = buildChromeContextMenu
