import { promises as fs } from 'fs'
import * as path from 'path'
import { nativeImage } from 'electron'

export interface TabContents extends Electron.WebContents {
  favicon?: string
}

export type ContextMenuType =
  | 'all'
  | 'page'
  | 'frame'
  | 'selection'
  | 'link'
  | 'editable'
  | 'image'
  | 'video'
  | 'audio'
  | 'launcher'
  | 'browser_action'
  | 'page_action'
  | 'action'

/**
 * Get the extension's properly typed Manifest.
 *
 * I can't seem to get TS's merged type declarations working so I'm using this
 * instead for now.
 */
export const getExtensionManifest = (extension: Electron.Extension): chrome.runtime.Manifest =>
  extension.manifest

export const getExtensionUrl = (extension: Electron.Extension, uri: string) => {
  try {
    return new URL(uri, extension.url).href
  } catch {}
}

export const resolveExtensionPath = (extension: Electron.Extension, uri: string) => {
  const resPath = path.join(extension.path, uri)

  // prevent any parent traversals
  if (!resPath.startsWith(extension.path)) return

  return resPath
}

export const validateExtensionResource = async (extension: Electron.Extension, uri: string) => {
  const resPath = resolveExtensionPath(extension, uri)
  if (!resPath) return

  try {
    await fs.stat(resPath)
  } catch {
    return // doesn't exist
  }

  return resPath
}

export enum ResizeType {
  Exact,
  Up,
  Down,
}

export const matchSize = (
  imageSet: { [key: number]: string },
  size: number,
  match: ResizeType
): string | undefined => {
  // TODO: match based on size
  const first = parseInt(Object.keys(imageSet).pop()!, 10)
  return imageSet[first]
}

/** Gets the relative path to the extension's default icon. */
export const getIconPath = (
  extension: Electron.Extension,
  iconSize: number = 32,
  resizeType = ResizeType.Up
) => {
  const { browser_action, icons } = getExtensionManifest(extension)
  const { default_icon } = browser_action || {}

  if (typeof default_icon === 'string') {
    const iconPath = default_icon
    return iconPath
  } else if (typeof default_icon === 'object') {
    const iconPath = matchSize(default_icon, iconSize, resizeType)
    return iconPath
  } else if (typeof icons === 'object') {
    const iconPath = matchSize(icons, iconSize, resizeType)
    return iconPath
  }
}

export const getIconImage = (extension: Electron.Extension) => {
  const iconPath = getIconPath(extension)
  const iconAbsolutePath = iconPath && resolveExtensionPath(extension, iconPath)
  return iconAbsolutePath ? nativeImage.createFromPath(iconAbsolutePath) : undefined
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
