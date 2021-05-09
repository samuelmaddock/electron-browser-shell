import { promises as fs } from 'fs'
import * as path from 'path'
import { nativeImage } from 'electron'

export interface TabContents extends Electron.WebContents {
  favicon?: string
}

export const resolveExtensionResource = async (extension: Electron.Extension, uri: string) => {
  const resPath = path.join(extension.path, uri)

  // prevent any parent traversals
  if (!resPath.startsWith(extension.path)) return

  try {
    await fs.stat(resPath)
  } catch {
    return // doesn't exist
  }

  return resPath
}

export const getIconPath = (extension: Electron.Extension) => {
  const { browser_action, icons } = extension.manifest
  const { default_icon } = browser_action

  if (typeof default_icon === 'string') {
    const iconPath = path.join(extension.path, default_icon)
    return iconPath
  } else if (typeof default_icon === 'object') {
    const key = Object.keys(default_icon).pop() as any
    const iconPath = path.join(extension.path, default_icon[key])
    return iconPath
  } else if (typeof icons === 'object') {
    const key = Object.keys(icons).pop() as any
    const iconPath = path.join(extension.path, icons[key])
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
