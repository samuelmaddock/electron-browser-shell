import * as path from 'path'
import { BrowserWindow, nativeImage } from 'electron'

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

export const getIconPath = (extension: Electron.Extension) => {
  const { browser_action } = extension.manifest
  const { default_icon } = browser_action

  if (typeof default_icon === 'string') {
    const iconPath = path.join(extension.path, default_icon)
    return iconPath
  } else if (typeof default_icon === 'object') {
    const key = Object.keys(default_icon).pop() as any
    const iconPath = path.join(extension.path, default_icon[key])
    return iconPath
  }
}

export const getIconImage = (extension: Electron.Extension) => {
  const iconPath = getIconPath(extension)
  return iconPath && nativeImage.createFromPath(iconPath)
}
