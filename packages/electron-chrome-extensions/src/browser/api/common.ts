import { BrowserWindow } from 'electron'

export interface TabContents extends Electron.WebContents {
  favicon?: string
}

export const getParentWindowOfTab = (tab: TabContents): BrowserWindow | null => {
  switch (tab.getType()) {
    case 'window':
      return BrowserWindow.fromWebContents(tab)
    case 'browserView':
    case 'webview':
      return (tab as any).getOwnerBrowserWindow()
  }
  return null
}
