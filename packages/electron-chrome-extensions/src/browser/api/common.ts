import * as path from 'path'
import { nativeImage } from 'electron'

export interface TabContents extends Electron.WebContents {
  favicon?: string
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
  return iconPath ? nativeImage.createFromPath(iconPath) : undefined
}

const escapePattern = (pattern: string) => pattern.replace(/[\\^$+?.()|[\]{}]/g, '\\$&')

/**
 * @see https://developer.chrome.com/extensions/match_patterns
 */
export const matchesPattern = (pattern: string, url: string) => {
  if (pattern === '<all_urls>') return true
  const regexp = new RegExp(`^${pattern.split('*').map(escapePattern).join('.*')}$`)
  return url.match(regexp)
}
