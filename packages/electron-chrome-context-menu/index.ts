import { app, BrowserWindow, clipboard, dialog, Menu, MenuItem } from 'electron'

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
  copyLinkToHighlight: 'Copy link to highlight',
  print: 'Print...',
  saveAs: 'Save as...',
  viewSource: 'View page source',
  copyImage: 'Copy image',
  copyVideoFrame: 'Copy video frame',
  saveVideoFrameAs: 'Save video frame as...',
}

const getBrowserWindowFromWebContents = (webContents: Electron.WebContents) => {
  const directWindow = BrowserWindow.fromWebContents(webContents)
  if (directWindow) return directWindow

  return BrowserWindow.getAllWindows().find((win) => {
    if ('getBrowserViews' in win) {
      const views = win.getBrowserViews()
      if (views.some((view) => view.webContents === webContents)) return true
    } else if ('getBrowserView' in win) {
      // @ts-ignore
      const view = win.getBrowserView()
      if (view?.webContents === webContents) return true
    }

    if ('contentView' in win && win.contentView) {
      // @ts-ignore
      const findInView = (view: any): boolean => {
        if (view?.webContents === webContents) return true
        if (view?.children) {
          return view.children.some((child: any) => findInView(child))
        }
        return false
      }
      if (findInView(win.contentView)) return true
    }

    return false
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
    params: Electron.ContextMenuParams,
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

interface AppendHelpers {
  append: (opts: Electron.MenuItemConstructorOptions) => void
  appendSeparator: () => void
}

const isSavableURL = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url)
    // Savable schemes based on Chromium's implementation
    const savableSchemes = ['http', 'https', 'file', 'ftp', 'data']
    return savableSchemes.includes(parsedUrl.protocol.replace(':', ''))
  } catch {
    return false
  }
}

const isSavablePage = (webContents: Electron.WebContents): boolean => {
  const url = webContents.getURL()
  if (!url || !isSavableURL(url)) return false

  // Note: In Electron, we rely on webContents.savePage() to handle MIME type
  // validation internally. Chrome checks for specific MIME types (text/html,
  // text/xml, etc.), but Electron's API will fail gracefully if the page
  // cannot be saved.

  return true
}

const isViewSourceEnabled = (
  params: Electron.ContextMenuParams,
  webContents: Electron.WebContents,
): boolean => {
  const url = params.pageURL || webContents.getURL()
  if (url && url.startsWith('view-source:')) return false
  // TODO: Expose frame.mimeType to determine if we can view its source
  return Boolean(url) && !params.hasImageContents && params.mediaType === 'none'
}

const generateDefaultFilename = (webContents: Electron.WebContents, titleText: string): string => {
  let filename = webContents.getTitle() || titleText

  if (!filename) {
    try {
      const url = new URL(webContents.getURL())
      filename = url.hostname || 'page'
    } catch {
      filename = 'page'
    }
  }

  filename = filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200)

  return filename || 'page'
}

const getSaveTypeFromFilePath = (filePath: string): 'HTMLOnly' | 'HTMLComplete' | 'MHTML' => {
  const ext = filePath.toLowerCase().split('.').pop()

  if (ext === 'mhtml' || ext === 'mht') {
    return 'MHTML'
  }

  // For .html/.htm, we default to HTMLComplete
  // In a more sophisticated implementation, we could track which filter
  // the user selected, but Electron's dialog API doesn't provide this
  return 'HTMLComplete'
}

const appendPageItems = (
  params: Electron.ContextMenuParams,
  webContents: Electron.WebContents,
  labels: ChromeContextMenuLabels,
  { append }: AppendHelpers,
) => {
  // Only show print option when not on media elements (matches Chromium behavior)
  if (params.mediaType === 'none') {
    append({
      label: labels.saveAs,
      enabled: isSavablePage(webContents),
      click: async () => {
        const browserWindow = getBrowserWindowFromWebContents(webContents)
        if (!browserWindow) return

        const defaultFilename = generateDefaultFilename(webContents, params.titleText)

        const result = await dialog.showSaveDialog(browserWindow, {
          defaultPath: defaultFilename,
          filters: [
            { name: 'Webpage, Complete', extensions: ['html', 'htm'] },
            { name: 'Webpage, HTML Only', extensions: ['html', 'htm'] },
            { name: 'Webpage, Single File', extensions: ['mhtml', 'mht'] },
          ],
        })

        if (!result.canceled && result.filePath) {
          const saveType = getSaveTypeFromFilePath(result.filePath)
          webContents.savePage(result.filePath, saveType)
        }
      },
    })
    append({
      label: labels.print,
      click: () => {
        webContents.print()
      },
    })
  }
}

const appendDeveloperItems = (
  params: Electron.ContextMenuParams,
  webContents: Electron.WebContents,
  labels: ChromeContextMenuLabels,
  openLink: ChromeContextMenuOptions['openLink'],
  { append, appendSeparator }: AppendHelpers,
) => {
  // Developer items section (separate from page items, matches Chromium)
  appendSeparator()

  const canViewSource = isViewSourceEnabled(params, webContents)
  const pageURL = params.pageURL || webContents.getURL()

  append({
    label: labels.viewSource,
    enabled: canViewSource,
    click: () => {
      if (pageURL && canViewSource) {
        openLink(`view-source:${pageURL}`, 'default', params)
      }
    },
  })

  append({
    label: labels.inspect,
    click: () => {
      webContents.inspectElement(params.x, params.y)

      if (!webContents.isDevToolsFocused()) {
        webContents.devToolsWebContents?.focus()
      }
    },
  })
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

    if (params.mediaType === 'image' && params.hasImageContents) {
      append({
        label: labels.copyImage,
        click: () => {
          // TODO: upstream frame-level API
          webContents.copyImageAt(params.x, params.y)
        },
      })
    }

    if (params.mediaType === 'video' && params.frame) {
      append({
        label: labels.saveVideoFrameAs,
        click: () => {
          params.frame!.saveVideoFrameAs(params.x, params.y)
        },
      })
      append({
        label: labels.copyVideoFrame,
        click: () => {
          params.frame!.copyVideoFrameAt(params.x, params.y)
        },
      })
    }

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
        !['input-number', 'input-telephone'].includes(params.formControlType)
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

    if (params.pageURL) {
      append({
        label: labels.copyLinkToHighlight,
        click: () => {
          // https://web.dev/text-fragments/
          const textFragment = encodeURIComponent(params.selectionText.trim())
          const url = new URL(params.pageURL)
          url.hash = `#:~:text=${textFragment}`
          clipboard.writeText(url.toString())
        },
      })
    }

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
      enabled: webContents.navigationHistory.canGoBack(),
      click: () => webContents.navigationHistory.goBack(),
    })
    append({
      label: labels.forward,
      enabled: webContents.navigationHistory.canGoForward(),
      click: () => webContents.navigationHistory.goForward(),
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

  appendPageItems(params, webContents, labels, { append, appendSeparator })
  appendDeveloperItems(params, webContents, labels, openLink, { append, appendSeparator })

  return menu
}

export default buildChromeContextMenu
