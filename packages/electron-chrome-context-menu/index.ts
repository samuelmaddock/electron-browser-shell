import { app, BrowserWindow, clipboard, Menu, MenuItem } from 'electron'

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
  emoji: 'Emoji',
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
  const append = (opts: Electron.MenuItemConstructorOptions) => menu.append(new MenuItem(opts))
  const appendSeparator = () => menu.append(new MenuItem({ type: 'separator' }))

  if (params.linkURL) {
    append({
      label: labels.openInNewTab('link'),
      click: () => {
        openLink(params.linkURL, 'default', params)
      },
    })
    append({
      label: labels.openInNewWindow('link'),
      click: () => {
        openLink(params.linkURL, 'new-window', params)
      },
    })
    appendSeparator()
    append({
      label: labels.copyAddress('link'),
      click: () => {
        clipboard.writeText(params.linkURL)
      },
    })
    appendSeparator()
  } else if (params.mediaType !== 'none') {
    // TODO: Loop, Show controls
    append({
      label: labels.openInNewTab(params.mediaType),
      click: () => {
        openLink(params.srcURL, 'default', params)
      },
    })
    append({
      label: labels.copyAddress(params.mediaType),
      click: () => {
        clipboard.writeText(params.srcURL)
      },
    })
    appendSeparator()
  }

  if (params.isEditable) {
    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions) {
        append({
          label: suggestion,
          click: () => webContents.replaceMisspelling(suggestion),
        })
      }

      if (params.dictionarySuggestions.length > 0) appendSeparator()

      append({
        label: labels.addToDictionary,
        click: () => webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      })
    } else {
      if (
        app.isEmojiPanelSupported() &&
        !['number', 'tel', 'other'].includes(params.inputFieldType)
      ) {
        append({
          label: labels.emoji,
          click: () => app.showEmojiPanel(),
        })
        appendSeparator()
      }

      append({
        label: labels.redo,
        enabled: params.editFlags.canRedo,
        click: () => webContents.redo(),
      })
      append({
        label: labels.undo,
        enabled: params.editFlags.canUndo,
        click: () => webContents.undo(),
      })
    }

    appendSeparator()

    append({
      label: labels.cut,
      enabled: params.editFlags.canCut,
      click: () => webContents.cut(),
    })
    append({
      label: labels.copy,
      enabled: params.editFlags.canCopy,
      click: () => webContents.copy(),
    })
    append({
      label: labels.paste,
      enabled: params.editFlags.canPaste,
      click: () => webContents.paste(),
    })
    append({
      label: labels.delete,
      enabled: params.editFlags.canDelete,
      click: () => webContents.delete(),
    })
    appendSeparator()
    if (params.editFlags.canSelectAll) {
      append({
        label: labels.selectAll,
        click: () => webContents.selectAll(),
      })
      appendSeparator()
    }
  } else if (params.selectionText) {
    append({
      label: labels.copy,
      click: () => {
        clipboard.writeText(params.selectionText)
      },
    })
    appendSeparator()
  }

  if (menu.items.length === 0) {
    const browserWindow = getBrowserWindowFromWebContents(webContents)

    // TODO: Electron needs a way to detect whether we're in HTML5 full screen.
    // Also need to properly exit full screen in Blink rather than just exiting
    // the Electron BrowserWindow.
    if (browserWindow?.fullScreen) {
      append({
        label: labels.exitFullScreen,
        click: () => browserWindow.setFullScreen(false),
      })

      appendSeparator()
    }

    append({
      label: labels.back,
      enabled: webContents.canGoBack(),
      click: () => webContents.goBack(),
    })
    append({
      label: labels.forward,
      enabled: webContents.canGoForward(),
      click: () => webContents.goForward(),
    })
    append({
      label: labels.reload,
      click: () => webContents.reload(),
    })
    appendSeparator()
  }

  if (extensionMenuItems) {
    extensionMenuItems.forEach((item) => menu.append(item))
    if (extensionMenuItems.length > 0) appendSeparator()
  }

  append({
    label: labels.inspect,
    click: () => {
      webContents.inspectElement(params.x, params.y)

      if (!webContents.isDevToolsFocused()) {
        webContents.devToolsWebContents?.focus()
      }
    },
  })

  return menu
}

export default buildChromeContextMenu
