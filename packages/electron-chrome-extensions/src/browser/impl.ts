export interface ExtensionEvent {
  sender: Electron.WebContents
}

/** App-specific implementation details for extensions. */
export interface ChromeExtensionImpl {
  createTab?(
    event: ExtensionEvent,
    details: chrome.tabs.CreateProperties
  ): Promise<[Electron.WebContents, Electron.BrowserWindow]>
  selectTab?(event: ExtensionEvent, tab: Electron.WebContents): void
  removeTab?(event: ExtensionEvent, tab: Electron.WebContents): void

  /**
   * Populate additional details to a tab descriptor which gets passed back to
   * background pages and content scripts.
   */
  assignTabDetails?(details: chrome.tabs.Tab, tab: Electron.WebContents): void

  createWindow?(
    event: ExtensionEvent,
    details: chrome.windows.CreateData
  ): Promise<Electron.BrowserWindow>
}
