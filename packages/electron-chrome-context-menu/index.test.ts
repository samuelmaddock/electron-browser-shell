import { describe, it, mock } from 'node:test'
import assert from 'node:assert'
import type { WebContents } from 'electron'

// Mock clipboard tracking
const clipboardWrites: string[] = []

// Mock app calls
const appCalls: string[] = []

// Create mock implementations before importing the module
const electronMock = {
  app: {
    isEmojiPanelSupported: () => true,
    showEmojiPanel: () => {
      appCalls.push('showEmojiPanel')
    },
  },
  clipboard: {
    writeText: (text: string) => {
      clipboardWrites.push(text)
    },
  },
  Menu: class MockMenu {
    items: any[] = []
    append(item: any) {
      this.items.push(item)
    }
  },
  MenuItem: class MockMenuItem {
    label?: string
    type?: string
    enabled?: boolean
    click?: () => void
    constructor(options: any) {
      Object.assign(this, options)
    }
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}

// Mock the electron module
mock.module('electron', { namedExports: electronMock })

// Now import the module under test
const { buildChromeContextMenu } = await import('./index.ts')

const createMockWebContents = (overrides: Partial<WebContents> = {}): WebContents => {
  const calls: any = {
    replaceMisspelling: [],
    redo: [],
    undo: [],
    cut: [],
    copy: [],
    paste: [],
    delete: [],
    selectAll: [],
    inspectElement: [],
    reload: [],
  }

  return {
    replaceMisspelling: (word: string) => calls.replaceMisspelling.push(word),
    redo: () => calls.redo.push(true),
    undo: () => calls.undo.push(true),
    cut: () => calls.cut.push(true),
    copy: () => calls.copy.push(true),
    paste: () => calls.paste.push(true),
    delete: () => calls.delete.push(true),
    selectAll: () => calls.selectAll.push(true),
    inspectElement: (x: number, y: number) => calls.inspectElement.push({ x, y }),
    isDevToolsFocused: () => false,
    devToolsWebContents: null,
    reload: () => calls.reload.push(true),
    navigationHistory: {
      canGoBack: () => false,
      canGoForward: () => false,
      goBack: () => {},
      goForward: () => {},
    },
    session: {
      addWordToSpellCheckerDictionary: (word: string) => {},
    },
    _calls: calls,
    ...overrides,
  } as any
}

const createMockParams = (
  overrides: Partial<Electron.ContextMenuParams> = {},
): Electron.ContextMenuParams => {
  return {
    x: 0,
    y: 0,
    linkURL: '',
    linkText: '',
    pageURL: 'https://example.com',
    frameURL: '',
    srcURL: '',
    mediaType: 'none',
    hasImageContents: false,
    isEditable: false,
    selectionText: '',
    titleText: '',
    misspelledWord: '',
    dictionarySuggestions: [],
    frameCharset: '',
    inputFieldType: '',
    spellcheckEnabled: false,
    menuSourceType: 'none',
    mediaFlags: {
      inError: false,
      isPaused: false,
      isMuted: false,
      hasAudio: false,
      isLooping: false,
      isControlsVisible: false,
      canToggleControls: false,
      canRotate: false,
    },
    editFlags: {
      canUndo: false,
      canRedo: false,
      canCut: false,
      canCopy: false,
      canPaste: false,
      canDelete: false,
      canSelectAll: false,
      canEditRichly: false,
    },
    formControlType: '',
    ...overrides,
  } as Electron.ContextMenuParams
}

describe('buildChromeContextMenu', () => {
  describe('link context menu', () => {
    it('should create menu items for links', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({ linkURL: 'https://example.com/link' })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      assert.ok(menu.items.length > 0)
      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      assert.ok(labels.includes('Open link in new tab'))
      assert.ok(labels.includes('Open link in new window'))
      assert.ok(labels.includes('Copy link address'))
    })

    it('should call openLink when clicking "Open in new tab"', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({ linkURL: 'https://example.com/link' })
      const openLinkCalls: any[] = []
      const openLink = (...args: any[]) => openLinkCalls.push(args)

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const openInNewTabItem = menu.items.find((item: any) => item.label === 'Open link in new tab')
      assert.ok(openInNewTabItem)
      openInNewTabItem.click()

      assert.strictEqual(openLinkCalls.length, 1)
      assert.strictEqual(openLinkCalls[0][0], 'https://example.com/link')
      assert.strictEqual(openLinkCalls[0][1], 'default')
    })

    it('should copy link URL to clipboard', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({ linkURL: 'https://example.com/link' })
      const openLink = () => {}

      clipboardWrites.length = 0
      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const copyLinkItem = menu.items.find((item: any) => item.label === 'Copy link address')
      assert.ok(copyLinkItem)
      copyLinkItem.click()

      assert.strictEqual(clipboardWrites.length, 1)
      assert.strictEqual(clipboardWrites[0], 'https://example.com/link')
    })
  })

  describe('text selection context menu', () => {
    it('should create copy menu item for selected text', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({
        selectionText: 'Selected text',
        pageURL: 'https://example.com',
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      assert.ok(labels.includes('Copy'))
    })

    it('should copy selected text to clipboard', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({
        selectionText: 'Selected text',
        pageURL: 'https://example.com',
      })
      const openLink = () => {}

      clipboardWrites.length = 0
      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const copyItem = menu.items.find((item: any) => item.label === 'Copy')
      assert.ok(copyItem)
      copyItem.click()

      assert.strictEqual(clipboardWrites.length, 1)
      assert.strictEqual(clipboardWrites[0], 'Selected text')
    })

    it('should create "Copy link to highlight" menu item for selected text', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({
        selectionText: 'Selected text',
        pageURL: 'https://example.com/page',
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      assert.ok(labels.includes('Copy link to highlight'))
    })

    it('should copy text fragment URL to clipboard', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({
        selectionText: 'Selected text',
        pageURL: 'https://example.com/page',
      })
      const openLink = () => {}

      clipboardWrites.length = 0
      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const copyLinkToHighlightItem = menu.items.find(
        (item: any) => item.label === 'Copy link to highlight',
      )
      assert.ok(copyLinkToHighlightItem)
      copyLinkToHighlightItem.click()

      assert.strictEqual(clipboardWrites.length, 1)
      const copiedUrl = clipboardWrites[0]
      assert.ok(copiedUrl.includes('#:~:text=Selected%20text'))
      assert.ok(copiedUrl.startsWith('https://example.com/page'))
    })

    it('should not create "Copy link to highlight" without pageURL', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({
        selectionText: 'Selected text',
        pageURL: '',
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      assert.ok(!labels.includes('Copy link to highlight'))
    })
  })

  describe('editable context menu', () => {
    it('should create edit menu items for editable fields', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({
        isEditable: true,
        editFlags: {
          canUndo: true,
          canRedo: true,
          canCut: true,
          canCopy: true,
          canPaste: true,
          canDelete: true,
          canSelectAll: true,
          canEditRichly: false,
        },
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      assert.ok(labels.includes('Undo'))
      assert.ok(labels.includes('Redo'))
      assert.ok(labels.includes('Cut'))
      assert.ok(labels.includes('Copy'))
      assert.ok(labels.includes('Paste'))
      assert.ok(labels.includes('Delete'))
      assert.ok(labels.includes('Select All'))
    })

    it('should show emoji panel option for editable fields', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({
        isEditable: true,
        formControlType: 'input-text',
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      assert.ok(labels.includes('Emoji'))
    })

    it('should call webContents.cut when clicking Cut', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({
        isEditable: true,
        editFlags: {
          canCut: true,
          canCopy: false,
          canPaste: false,
          canDelete: false,
          canUndo: false,
          canRedo: false,
          canSelectAll: false,
          canEditRichly: false,
        },
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const cutItem = menu.items.find((item: any) => item.label === 'Cut')
      assert.ok(cutItem)
      cutItem.click()

      assert.strictEqual(webContents._calls.cut.length, 1)
    })

    it('should show spelling suggestions for misspelled words', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({
        isEditable: true,
        misspelledWord: 'teh',
        dictionarySuggestions: ['the', 'tea', 'ten'],
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      assert.ok(labels.includes('the'))
      assert.ok(labels.includes('tea'))
      assert.ok(labels.includes('ten'))
      assert.ok(labels.includes('Add to dictionary'))
    })

    it('should replace misspelled word when clicking suggestion', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({
        isEditable: true,
        misspelledWord: 'teh',
        dictionarySuggestions: ['the'],
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const suggestionItem = menu.items.find((item: any) => item.label === 'the')
      assert.ok(suggestionItem)
      suggestionItem.click()

      assert.strictEqual(webContents._calls.replaceMisspelling.length, 1)
      assert.strictEqual(webContents._calls.replaceMisspelling[0], 'the')
    })
  })

  describe('media context menu', () => {
    it('should create menu items for images', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({
        mediaType: 'image',
        srcURL: 'https://example.com/image.png',
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      assert.ok(labels.includes('Open image in new tab'))
      assert.ok(labels.includes('Copy image address'))
    })

    it('should create menu items for video', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({
        mediaType: 'video',
        srcURL: 'https://example.com/video.mp4',
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      assert.ok(labels.includes('Open video in new tab'))
      assert.ok(labels.includes('Copy video address'))
    })
  })

  describe('default context menu', () => {
    it('should create navigation menu items by default', () => {
      const webContents = createMockWebContents()
      const params = createMockParams()
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      assert.ok(labels.includes('Back'))
      assert.ok(labels.includes('Forward'))
      assert.ok(labels.includes('Reload'))
      assert.ok(labels.includes('Inspect'))
    })
  })

  describe('extension menu items', () => {
    it('should append extension menu items', () => {
      const webContents = createMockWebContents()
      const params = createMockParams()
      const openLink = () => {}
      const { MenuItem } = electronMock
      const extensionMenuItems = [
        new MenuItem({ label: 'Extension Action 1', click: () => {} }),
        new MenuItem({ label: 'Extension Action 2', click: () => {} }),
      ]

      const menu = buildChromeContextMenu({ params, webContents, openLink, extensionMenuItems })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      assert.ok(labels.includes('Extension Action 1'))
      assert.ok(labels.includes('Extension Action 2'))
    })
  })

  describe('custom labels', () => {
    it('should use custom labels when provided', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({ selectionText: 'text' })
      const openLink = () => {}
      const customLabels = {
        copy: 'Custom Copy',
      }

      const menu = buildChromeContextMenu({
        params,
        webContents,
        openLink,
        labels: customLabels as any,
      })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      assert.ok(labels.includes('Custom Copy'))
    })
  })
})
