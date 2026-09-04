import { describe, it } from 'node:test'
import { mock } from 'node:test'
import assert from 'node:assert'
import type { WebContents } from 'electron'

// Mock clipboard tracking
const clipboardWrites: string[] = []

// Mock app calls
const appCalls: string[] = []

// Mock dialog calls
const dialogCalls: any[] = []

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
  dialog: {
    showSaveDialog: async (browserWindow: any, options: any) => {
      dialogCalls.push({ browserWindow, options })
      // Return a mock result - can be overridden in tests
      return {
        canceled: false,
        filePath: options.defaultPath + '.html',
      }
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
    fromWebContents: () => ({
      // Return a mock browser window
      id: 1,
      webContents: null,
    }),
  },
}

// Mock the electron module
mock.module('electron', { namedExports: electronMock })

// Now import the module under test
const { buildChromeContextMenu } = await import('./index.ts')

interface MockWebContents extends WebContents {
  _calls: any
}

const createMockWebContents = (overrides: Partial<WebContents> = {}): MockWebContents => {
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
    print: [],
    savePage: [],
    copyImageAt: [],
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
    print: () => calls.print.push(true),
    savePage: (fullPath: string, saveType: string) => calls.savePage.push({ fullPath, saveType }),
    copyImageAt: (x: number, y: number) => calls.copyImageAt.push({ x, y }),
    getURL: () => 'https://example.com',
    getTitle: () => 'Example Page',
    navigationHistory: {
      canGoBack: () => false,
      canGoForward: () => false,
      goBack: () => {},
      goForward: () => {},
    },
    session: {
      addWordToSpellCheckerDictionary: () => {},
    },
    _calls: calls,
    ...overrides,
  } as any
}

const createMockFrame = () => {
  const calls: any = {
    copyVideoFrameAt: [],
    saveVideoFrameAs: [],
  }
  return {
    copyVideoFrameAt: (x: number, y: number) => calls.copyVideoFrameAt.push({ x, y }),
    saveVideoFrameAs: (x: number, y: number) => calls.saveVideoFrameAs.push({ x, y }),
    _calls: calls,
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
    frame: null,
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

  describe('copy image', () => {
    it('should create "Copy image" menu item for images with content', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({
        mediaType: 'image',
        srcURL: 'https://example.com/image.png',
        hasImageContents: true,
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      assert.ok(labels.includes('Copy image'))
    })

    it('should NOT create "Copy image" menu item for images without content', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({
        mediaType: 'image',
        srcURL: 'https://example.com/image.png',
        hasImageContents: false,
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      assert.ok(!labels.includes('Copy image'))
    })

    it('should NOT create "Copy image" menu item for non-image media', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({
        mediaType: 'video',
        srcURL: 'https://example.com/video.mp4',
        hasImageContents: false,
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      assert.ok(!labels.includes('Copy image'))
    })

    it('should call webContents.copyImageAt with correct coordinates', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({
        x: 150,
        y: 250,
        mediaType: 'image',
        srcURL: 'https://example.com/image.png',
        hasImageContents: true,
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const copyImageItem = menu.items.find((item: any) => item.label === 'Copy image')
      assert.ok(copyImageItem)
      copyImageItem.click()

      assert.strictEqual(webContents._calls.copyImageAt.length, 1)
      assert.strictEqual(webContents._calls.copyImageAt[0].x, 150)
      assert.strictEqual(webContents._calls.copyImageAt[0].y, 250)
    })

    it('should place "Copy image" between "Open in new tab" and "Copy image address"', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({
        mediaType: 'image',
        srcURL: 'https://example.com/image.png',
        hasImageContents: true,
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      const openInNewTabIndex = labels.indexOf('Open image in new tab')
      const copyImageIndex = labels.indexOf('Copy image')
      const copyImageAddressIndex = labels.indexOf('Copy image address')

      assert.ok(openInNewTabIndex !== -1)
      assert.ok(copyImageIndex !== -1)
      assert.ok(copyImageAddressIndex !== -1)
      assert.ok(openInNewTabIndex < copyImageIndex)
      assert.ok(copyImageIndex < copyImageAddressIndex)
    })
  })

  describe('video frame operations', () => {
    it('should create video frame menu items for videos with frame', () => {
      const webContents = createMockWebContents()
      const frame = createMockFrame()
      const params = createMockParams({
        mediaType: 'video',
        srcURL: 'https://example.com/video.mp4',
        frame,
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      assert.ok(labels.includes('Save video frame as...'))
      assert.ok(labels.includes('Copy video frame'))
    })

    it('should NOT create video frame menu items for videos without frame', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({
        mediaType: 'video',
        srcURL: 'https://example.com/video.mp4',
        frame: null,
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      assert.ok(!labels.includes('Save video frame as...'))
      assert.ok(!labels.includes('Copy video frame'))
    })

    it('should NOT create video frame menu items for non-video media', () => {
      const webContents = createMockWebContents()
      const frame = createMockFrame()
      const params = createMockParams({
        mediaType: 'image',
        srcURL: 'https://example.com/image.png',
        frame,
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      assert.ok(!labels.includes('Save video frame as...'))
      assert.ok(!labels.includes('Copy video frame'))
    })

    it('should call frame.saveVideoFrameAs with correct coordinates', () => {
      const webContents = createMockWebContents()
      const frame = createMockFrame()
      const params = createMockParams({
        x: 100,
        y: 200,
        mediaType: 'video',
        srcURL: 'https://example.com/video.mp4',
        frame,
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const saveVideoFrameItem = menu.items.find(
        (item: any) => item.label === 'Save video frame as...',
      )
      assert.ok(saveVideoFrameItem)
      saveVideoFrameItem.click()

      assert.strictEqual(frame._calls.saveVideoFrameAs.length, 1)
      assert.strictEqual(frame._calls.saveVideoFrameAs[0].x, 100)
      assert.strictEqual(frame._calls.saveVideoFrameAs[0].y, 200)
    })

    it('should call frame.copyVideoFrameAt with correct coordinates', () => {
      const webContents = createMockWebContents()
      const frame = createMockFrame()
      const params = createMockParams({
        x: 100,
        y: 200,
        mediaType: 'video',
        srcURL: 'https://example.com/video.mp4',
        frame,
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const copyVideoFrameItem = menu.items.find((item: any) => item.label === 'Copy video frame')
      assert.ok(copyVideoFrameItem)
      copyVideoFrameItem.click()

      assert.strictEqual(frame._calls.copyVideoFrameAt.length, 1)
      assert.strictEqual(frame._calls.copyVideoFrameAt[0].x, 100)
      assert.strictEqual(frame._calls.copyVideoFrameAt[0].y, 200)
    })

    it('should place video frame items after "Open in new tab" and before "Copy video address"', () => {
      const webContents = createMockWebContents()
      const frame = createMockFrame()
      const params = createMockParams({
        mediaType: 'video',
        srcURL: 'https://example.com/video.mp4',
        frame,
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      const openInNewTabIndex = labels.indexOf('Open video in new tab')
      const saveVideoFrameIndex = labels.indexOf('Save video frame as...')
      const copyVideoFrameIndex = labels.indexOf('Copy video frame')
      const copyVideoAddressIndex = labels.indexOf('Copy video address')

      assert.ok(openInNewTabIndex !== -1)
      assert.ok(saveVideoFrameIndex !== -1)
      assert.ok(copyVideoFrameIndex !== -1)
      assert.ok(copyVideoAddressIndex !== -1)
      assert.ok(openInNewTabIndex < saveVideoFrameIndex)
      assert.ok(saveVideoFrameIndex < copyVideoFrameIndex)
      assert.ok(copyVideoFrameIndex < copyVideoAddressIndex)
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

  describe('print context menu', () => {
    it('should create Print menu item on default page context menu', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({ mediaType: 'none' })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      assert.ok(labels.includes('Print...'))
    })

    it('should NOT create Print menu item for media elements', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({
        mediaType: 'image',
        srcURL: 'https://example.com/image.png',
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      assert.ok(!labels.includes('Print...'))
    })

    it('should call webContents.print when clicking Print', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({ mediaType: 'none' })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const printItem = menu.items.find((item: any) => item.label === 'Print...')
      assert.ok(printItem)
      printItem.click()

      assert.strictEqual(webContents._calls.print.length, 1)
    })

    it('should create Print menu item before Inspect (in separate section)', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({ mediaType: 'none' })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const labels = menu.items.map((item: any) => item.label || item.type).filter(Boolean)
      const printIndex = labels.indexOf('Print...')
      const inspectIndex = labels.indexOf('Inspect')

      assert.ok(printIndex !== -1, 'Print menu item should exist')
      assert.ok(inspectIndex !== -1, 'Inspect menu item should exist')
      assert.ok(printIndex < inspectIndex, 'Print should appear before Inspect')

      // Check that there's a separator between Print and Inspect
      const itemsBetween = labels.slice(printIndex + 1, inspectIndex)
      assert.ok(
        itemsBetween.includes('separator'),
        'Should have separator between Print and Inspect',
      )
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

      const menu = buildChromeContextMenu({
        params,
        webContents,
        openLink,
        extensionMenuItems: extensionMenuItems as any,
      })

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

  describe('save page context menu', () => {
    it('should create Save As menu item on default page context menu', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({ mediaType: 'none' })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      assert.ok(labels.includes('Save as...'))
    })

    it('should NOT create Save As menu item for media elements', () => {
      const webContents = createMockWebContents()
      const params = createMockParams({
        mediaType: 'image',
        srcURL: 'https://example.com/image.png',
      })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const labels = menu.items.map((item: any) => item.label).filter(Boolean)
      assert.ok(!labels.includes('Save as...'))
    })

    it('should use page title as default filename', async () => {
      const webContents = createMockWebContents({
        getTitle: () => 'My Amazing Page',
      } as any)
      const params = createMockParams({ mediaType: 'none' })
      const openLink = () => {}

      dialogCalls.length = 0
      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const saveAsItem = menu.items.find((item: any) => item.label === 'Save as...')
      assert.ok(saveAsItem)
      assert.ok(saveAsItem.enabled !== false, 'Save As should be enabled')

      await saveAsItem.click()

      assert.strictEqual(dialogCalls.length, 1)
      assert.strictEqual(dialogCalls[0].options.defaultPath, 'My Amazing Page')
    })

    it('should use titleText param as fallback for filename', async () => {
      const webContents = createMockWebContents({
        getTitle: () => '',
      } as any)
      const params = createMockParams({
        mediaType: 'none',
        titleText: 'Fallback Title',
      })
      const openLink = () => {}

      dialogCalls.length = 0
      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const saveAsItem = menu.items.find((item: any) => item.label === 'Save as...')
      assert.ok(saveAsItem)
      await saveAsItem.click()

      assert.strictEqual(dialogCalls.length, 1)
      assert.strictEqual(dialogCalls[0].options.defaultPath, 'Fallback Title')
    })

    it('should use URL hostname as fallback for filename', async () => {
      const webContents = createMockWebContents({
        getTitle: () => '',
        getURL: () => 'https://example.com/page',
      } as any)
      const params = createMockParams({
        mediaType: 'none',
        titleText: '',
      })
      const openLink = () => {}

      dialogCalls.length = 0
      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const saveAsItem = menu.items.find((item: any) => item.label === 'Save as...')
      assert.ok(saveAsItem)
      await saveAsItem.click()

      assert.strictEqual(dialogCalls.length, 1)
      assert.strictEqual(dialogCalls[0].options.defaultPath, 'example.com')
    })

    it('should sanitize filename by removing invalid characters', async () => {
      const webContents = createMockWebContents({
        getTitle: () => 'My<>:"/\\|?*File',
      } as any)
      const params = createMockParams({ mediaType: 'none' })
      const openLink = () => {}

      dialogCalls.length = 0
      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const saveAsItem = menu.items.find((item: any) => item.label === 'Save as...')
      assert.ok(saveAsItem)
      await saveAsItem.click()

      assert.strictEqual(dialogCalls.length, 1)
      const filename = dialogCalls[0].options.defaultPath
      assert.ok(!filename.match(/[<>:"/\\|?*]/), 'Filename should not contain invalid characters')
      assert.strictEqual(filename, 'My_________File')
    })

    it('should show three save format options in dialog', async () => {
      const webContents = createMockWebContents()
      const params = createMockParams({ mediaType: 'none' })
      const openLink = () => {}

      dialogCalls.length = 0
      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const saveAsItem = menu.items.find((item: any) => item.label === 'Save as...')
      assert.ok(saveAsItem)
      await saveAsItem.click()

      assert.strictEqual(dialogCalls.length, 1)
      const filters = dialogCalls[0].options.filters
      assert.strictEqual(filters.length, 3)
      assert.strictEqual(filters[0].name, 'Webpage, Complete')
      assert.strictEqual(filters[1].name, 'Webpage, HTML Only')
      assert.strictEqual(filters[2].name, 'Webpage, Single File')
    })

    it('should call savePage with HTMLComplete for .html file', async () => {
      const webContents = createMockWebContents()
      const params = createMockParams({ mediaType: 'none' })
      const openLink = () => {}

      // Override the dialog mock for this test
      electronMock.dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: '/path/to/page.html',
      })

      const menu = buildChromeContextMenu({ params, webContents, openLink })
      const saveAsItem = menu.items.find((item: any) => item.label === 'Save as...')
      assert.ok(saveAsItem)
      await saveAsItem.click()

      assert.strictEqual(webContents._calls.savePage.length, 1)
      assert.strictEqual(webContents._calls.savePage[0].fullPath, '/path/to/page.html')
      assert.strictEqual(webContents._calls.savePage[0].saveType, 'HTMLComplete')
    })

    it('should call savePage with MHTML for .mhtml file', async () => {
      const webContents = createMockWebContents()
      const params = createMockParams({ mediaType: 'none' })
      const openLink = () => {}

      electronMock.dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: '/path/to/page.mhtml',
      })

      const menu = buildChromeContextMenu({ params, webContents, openLink })
      const saveAsItem = menu.items.find((item: any) => item.label === 'Save as...')
      assert.ok(saveAsItem)
      await saveAsItem.click()

      assert.strictEqual(webContents._calls.savePage.length, 1)
      assert.strictEqual(webContents._calls.savePage[0].fullPath, '/path/to/page.mhtml')
      assert.strictEqual(webContents._calls.savePage[0].saveType, 'MHTML')
    })

    it('should not save when dialog is canceled', async () => {
      const webContents = createMockWebContents()
      const params = createMockParams({ mediaType: 'none' })
      const openLink = () => {}

      electronMock.dialog.showSaveDialog = async () => ({
        canceled: true,
        filePath: undefined as any,
      })

      const menu = buildChromeContextMenu({ params, webContents, openLink })
      const saveAsItem = menu.items.find((item: any) => item.label === 'Save as...')
      assert.ok(saveAsItem)
      await saveAsItem.click()

      assert.strictEqual(webContents._calls.savePage.length, 0)
    })

    it('should disable Save As for unsavable URLs', () => {
      const webContents = createMockWebContents({
        getURL: () => 'javascript:alert("test")',
      } as any)
      const params = createMockParams({ mediaType: 'none' })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const saveAsItem = menu.items.find((item: any) => item.label === 'Save as...')
      assert.ok(saveAsItem)
      assert.strictEqual(saveAsItem.enabled, false)
    })

    it('should enable Save As for http URLs', () => {
      const webContents = createMockWebContents({
        getURL: () => 'http://example.com',
      } as any)
      const params = createMockParams({ mediaType: 'none' })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const saveAsItem = menu.items.find((item: any) => item.label === 'Save as...')
      assert.ok(saveAsItem)
      assert.ok(saveAsItem.enabled !== false)
    })

    it('should enable Save As for https URLs', () => {
      const webContents = createMockWebContents({
        getURL: () => 'https://example.com',
      } as any)
      const params = createMockParams({ mediaType: 'none' })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const saveAsItem = menu.items.find((item: any) => item.label === 'Save as...')
      assert.ok(saveAsItem)
      assert.ok(saveAsItem.enabled !== false)
    })

    it('should enable Save As for file URLs', () => {
      const webContents = createMockWebContents({
        getURL: () => 'file:///path/to/file.html',
      } as any)
      const params = createMockParams({ mediaType: 'none' })
      const openLink = () => {}

      const menu = buildChromeContextMenu({ params, webContents, openLink })

      const saveAsItem = menu.items.find((item: any) => item.label === 'Save as...')
      assert.ok(saveAsItem)
      assert.ok(saveAsItem.enabled !== false)
    })
  })
})
