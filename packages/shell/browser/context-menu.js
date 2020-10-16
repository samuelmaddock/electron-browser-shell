const { Menu, MenuItem } = require('electron')

const setupContextMenu = (browser, webContents, params) => {
  const win = browser.getFocusedWindow()
  const menu = new Menu()

  if (params.linkURL) {
    menu.append(
      new MenuItem({
        label: 'Open link in new tab',
        click: () => {
          const tab = win.tabs.create()
          tab.loadURL(params.linkURL)
        },
      })
    )
    menu.append(
      new MenuItem({
        label: 'Open link in new window',
        click: () => {
          browser.createWindow({ initialUrl: params.linkURL })
        },
      })
    )
    menu.append(new MenuItem({ type: 'separator' }))
    menu.append(
      new MenuItem({
        label: 'Copy link address',
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
        label: `Open ${params.mediaType} in new tab`,
        click: () => {
          const tab = win.tabs.create()
          tab.loadURL(params.srcURL)
        },
      })
    )
    menu.append(
      new MenuItem({
        label: `Copy ${params.mediaType} address`,
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
        label: 'Undo',
        enabled: params.editFlags.canUndo,
        click: () => webContents.undo(),
      })
    )
    menu.append(new MenuItem({ type: 'separator' }))
    menu.append(
      new MenuItem({
        label: 'Cut',
        enabled: params.editFlags.canCut,
        click: () => webContents.cut(),
      })
    )
    menu.append(
      new MenuItem({
        label: 'Copy',
        enabled: params.editFlags.canCopy,
        click: () => webContents.copy(),
      })
    )
    menu.append(
      new MenuItem({
        label: 'Paste',
        enabled: params.editFlags.canPaste,
        click: () => webContents.paste(),
      })
    )
    menu.append(
      new MenuItem({
        label: 'Delete',
        enabled: params.editFlags.canDelete,
        click: () => webContents.delete(),
      })
    )
    menu.append(new MenuItem({ type: 'separator' }))
    if (params.editFlags.canSelectAll) {
      menu.append(
        new MenuItem({
          label: 'Select All',
          click: () => webContents.selectAll(),
        })
      )
      menu.append(new MenuItem({ type: 'separator' }))
    }
  } else if (params.selectionText) {
    menu.append(
      new MenuItem({
        label: 'Copy',
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
        label: 'Back',
        enabled: webContents.canGoBack(),
        click: () => webContents.goBack(),
      })
    )
    menu.append(
      new MenuItem({
        label: 'Forward',
        enabled: webContents.canGoForward(),
        click: () => webContents.goForward(),
      })
    )
    menu.append(
      new MenuItem({
        label: 'Reload',
        click: () => webContents.reload(),
      })
    )
    menu.append(new MenuItem({ type: 'separator' }))
  }

  const items = browser.extensions.contextMenus.buildMenuItems(webContents, params)
  items.forEach((item) => menu.append(item))
  if (items.length > 0) menu.append(new MenuItem({ type: 'separator' }))

  menu.append(
    new MenuItem({
      label: 'Inspect',
      click: () => webContents.openDevTools(),
    })
  )

  menu.popup()

  return menu
}

module.exports = {
  setupContextMenu,
}
