import { BrowserWindow, clipboard, Menu, MenuItem } from 'electron'

const LABELS = {
  openInNewTab: (type: 'link' | Electron.ContextMenuParams['mediaType']) =>
    `Open ${type} in new tab`,
  openInNewWindow: (type: 'link' | Electron.ContextMenuParams['mediaType']) =>
    `Open ${type} in new window`,
  copyAddress: (type: 'link' | Electron.ContextMenuParams['mediaType']) => `Copy ${type} address`,
  undo: 'Undo',
  redo: 'Redo',
  cut: 'Cut',
  copy: 'Copy',
  delete: 'Delete',
  paste: 'Paste',
  selectAll: 'Select All',
  back: 'Back',
  forward: 'Forward',
  reload: 'Reload',
  inspect: 'Inspect',
  addToDictionary: 'Add to dictionary',
  exitFullScreen: 'Exit full screen',
}

const getBrowserWindowFromWebContents = (webContents: Electron.WebContents) => {
  return BrowserWindow.getAllWindows().find((win) => {
    if (win.webContents === webContents) return true

    let browserViews: Electron.BrowserView[]

    if ('getBrowserViews' in win) {
      browserViews = win.getBrowserViews()
    } else if ('getBrowserView' in win) {
      // @ts-ignore
      browserViews = [win.getBrowserView()]
    } else {
      browserViews = []
    }

    return browserViews.some((view) => view.webContents === webContents)
  })
}

type ChromeContextMenuLabels = typeof LABELS

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

  /** Labels used to create menu items. Replace this if localization is needed. */
  labels?: ChromeContextMenuLabels

  /**
   * @deprecated Use 'labels' instead.
   */
  strings?: ChromeContextMenuLabels
}

export const buildChromeContextMenu = (opts: ChromeContextMenuOptions): Menu => {
  const { params, webContents, openLink, extensionMenuItems } = opts

  const labels = opts.labels || opts.strings || LABELS

  const menu = new Menu()
  const addSeparator = () => menu.append(new MenuItem({ type: 'separator' }))

  if (params.linkURL) {
    menu.append(
      new MenuItem({
        label: labels.openInNewTab('link'),
        click: () => {
          openLink(params.linkURL, 'default', params)
        },
      })
    )
    menu.append(
      new MenuItem({
        label: labels.openInNewWindow('link'),
        click: () => {
          openLink(params.linkURL, 'new-window', params)
        },
      })
    )
    addSeparator()
    menu.append(
      new MenuItem({
        label: labels.copyAddress('link'),
        click: () => {
          clipboard.writeText(params.linkURL)
        },
      })
    )
    addSeparator()
  } else if (params.mediaType !== 'none') {
    // TODO: Loop, Show controls
    menu.append(
      new MenuItem({
        label: labels.openInNewTab(params.mediaType),
        click: () => {
          openLink(params.srcURL, 'default', params)
        },
      })
    )
    menu.append(
      new MenuItem({
        label: labels.copyAddress(params.mediaType),
        click: () => {
          clipboard.writeText(params.srcURL)
        },
      })
    )
    addSeparator()
  }

  if (params.isEditable) {
    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions) {
        menu.append(
          new MenuItem({
            label: suggestion,
            click: () => webContents.replaceMisspelling(suggestion),
          })
        )
      }

      if (params.dictionarySuggestions.length > 0) addSeparator()

      menu.append(
        new MenuItem({
          label: labels.addToDictionary,
          click: () => webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        })
      )
    } else {
      menu.append(
        new MenuItem({
          label: labels.redo,
          enabled: params.editFlags.canRedo,
          click: () => webContents.redo(),
        })
      )
      menu.append(
        new MenuItem({
          label: labels.undo,
          enabled: params.editFlags.canUndo,
          click: () => webContents.undo(),
        })
      )
    }

    addSeparator()

    menu.append(
      new MenuItem({
        label: labels.cut,
        enabled: params.editFlags.canCut,
        click: () => webContents.cut(),
      })
    )
    menu.append(
      new MenuItem({
        label: labels.copy,
        enabled: params.editFlags.canCopy,
        click: () => webContents.copy(),
      })
    )
    menu.append(
      new MenuItem({
        label: labels.paste,
        enabled: params.editFlags.canPaste,
        click: () => webContents.paste(),
      })
    )
    menu.append(
      new MenuItem({
        label: labels.delete,
        enabled: params.editFlags.canDelete,
        click: () => webContents.delete(),
      })
    )
    addSeparator()
    if (params.editFlags.canSelectAll) {
      menu.append(
        new MenuItem({
          label: labels.selectAll,
          click: () => webContents.selectAll(),
        })
      )
      addSeparator()
    }
  } else if (params.selectionText) {
    menu.append(
      new MenuItem({
        label: labels.copy,
        click: () => {
          clipboard.writeText(params.selectionText)
        },
      })
    )
    addSeparator()
  }

  if (menu.items.length === 0) {
    const browserWindow = getBrowserWindowFromWebContents(webContents)

    // TODO: Electron needs a way to detect whether we're in HTML5 full screen.
    // Also need to properly exit full screen in Blink rather than just exiting
    // the Electron BrowserWindow.
    if (browserWindow?.fullScreen) {
      menu.append(
        new MenuItem({
          label: labels.exitFullScreen,
          click: () => browserWindow.setFullScreen(false),
        })
      )

      addSeparator()
    }

    menu.append(
      new MenuItem({
        label: labels.back,
        enabled: webContents.canGoBack(),
        click: () => webContents.goBack(),
      })
    )
    menu.append(
      new MenuItem({
        label: labels.forward,
        enabled: webContents.canGoForward(),
        click: () => webContents.goForward(),
      })
    )
    menu.append(
      new MenuItem({
        label: labels.reload,
        click: () => webContents.reload(),
      })
    )
    addSeparator()
  }

  if (extensionMenuItems) {
    extensionMenuItems.forEach((item) => menu.append(item))
    if (extensionMenuItems.length > 0) addSeparator()
  }

  menu.append(
    new MenuItem({
      label: labels.inspect,
      click: () => {
        webContents.inspectElement(params.x, params.y)

        if (!webContents.isDevToolsFocused()) {
          webContents.devToolsWebContents?.focus()
        }
      },
    })
  )

  return menu
}

export default buildChromeContextMenu
