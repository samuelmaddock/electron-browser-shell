import * as fs from 'node:fs'
import * as path from 'node:path'
import debug from 'debug'

import { generateId } from './id'
import { compareVersions } from './utils'
import { ExtensionId } from './types'

const d = debug('electron-chrome-web-store:loader')

type ExtensionPathBaseInfo = { manifest: chrome.runtime.Manifest; path: string }
type ExtensionPathInfo =
  | ({ type: 'store'; id: string } & ExtensionPathBaseInfo)
  | ({ type: 'unpacked' } & ExtensionPathBaseInfo)

const manifestExists = async (dirPath: string) => {
  if (!dirPath) return false
  const manifestPath = path.join(dirPath, 'manifest.json')
  try {
    return (await fs.promises.stat(manifestPath)).isFile()
  } catch {
    return false
  }
}

/**
 * DFS directories for extension manifests.
 */
async function extensionSearch(dirPath: string, depth: number = 0): Promise<string[]> {
  if (depth >= 2) return []
  const results = []
  const dirEntries = await fs.promises.readdir(dirPath, { withFileTypes: true })
  for (const entry of dirEntries) {
    if (entry.isDirectory()) {
      if (await manifestExists(path.join(dirPath, entry.name))) {
        results.push(path.join(dirPath, entry.name))
      } else {
        results.push(...(await extensionSearch(path.join(dirPath, entry.name), depth + 1)))
      }
    }
  }
  return results
}

/**
 * Discover list of extensions in the given path.
 */
async function discoverExtensions(extensionsPath: string): Promise<ExtensionPathInfo[]> {
  try {
    const stat = await fs.promises.stat(extensionsPath)
    if (!stat.isDirectory()) {
      d('%s is not a directory', extensionsPath)
      return []
    }
  } catch {
    d('%s does not exist', extensionsPath)
    return []
  }

  const extensionDirectories = await extensionSearch(extensionsPath)
  const results: ExtensionPathInfo[] = []

  for (const extPath of extensionDirectories.filter(Boolean)) {
    try {
      const manifestPath = path.join(extPath!, 'manifest.json')
      const manifestJson = (await fs.promises.readFile(manifestPath)).toString()
      const manifest: chrome.runtime.Manifest = JSON.parse(manifestJson)
      const result = manifest.key
        ? {
            type: 'store' as const,
            path: extPath!,
            manifest,
            id: generateId(manifest.key),
          }
        : {
            type: 'unpacked' as const,
            path: extPath!,
            manifest,
          }
      results.push(result)
    } catch (e) {
      console.error(e)
    }
  }

  return results
}

/**
 * Filter any outdated extensions in the case of duplicate installations.
 */
function filterOutdatedExtensions(extensions: ExtensionPathInfo[]): ExtensionPathInfo[] {
  const uniqueExtensions: ExtensionPathInfo[] = []
  const storeExtMap = new Map<ExtensionId, ExtensionPathInfo>()

  for (const ext of extensions) {
    if (ext.type === 'unpacked') {
      // Unpacked extensions are always unique to their path
      uniqueExtensions.push(ext)
    } else if (!storeExtMap.has(ext.id)) {
      // New store extension
      storeExtMap.set(ext.id, ext)
    } else {
      // Existing store extension, compare with existing version
      const latestExt = storeExtMap.get(ext.id)!
      if (compareVersions(latestExt.manifest.version, ext.manifest.version) < 0) {
        storeExtMap.set(ext.id, ext)
      }
    }
  }

  // Append up to date store extensions
  storeExtMap.forEach((ext) => uniqueExtensions.push(ext))

  return uniqueExtensions
}

/**
 * Load all extensions from the given directory.
 */
export async function loadAllExtensions(
  session: Electron.Session,
  extensionsPath: string,
  options: {
    allowUnpacked?: boolean
  } = {},
) {
  const sessionExtensions = session.extensions || session

  let extensions = await discoverExtensions(extensionsPath)
  extensions = filterOutdatedExtensions(extensions)
  d('discovered %d extension(s) in %s', extensions.length, extensionsPath)

  for (const ext of extensions) {
    try {
      let extension: Electron.Extension | undefined
      if (ext.type === 'store') {
        const existingExt = sessionExtensions.getExtension(ext.id)
        if (existingExt) {
          d('skipping loading existing extension %s', ext.id)
          continue
        }
        d('loading extension %s', `${ext.id}@${ext.manifest.version}`)
        extension = await sessionExtensions.loadExtension(ext.path)
      } else if (options.allowUnpacked) {
        d('loading unpacked extension %s', ext.path)
        extension = await sessionExtensions.loadExtension(ext.path)
      }

      if (
        extension &&
        extension.manifest.manifest_version === 3 &&
        extension.manifest.background?.service_worker
      ) {
        const scope = `chrome-extension://${extension.id}`
        await session.serviceWorkers.startWorkerForScope(scope).catch(() => {
          console.error(`Failed to start worker for extension ${extension.id}`)
        })
      }
    } catch (error) {
      console.error(`Failed to load extension from ${ext.path}`)
      console.error(error)
    }
  }
}

export async function findExtensionInstall(extensionId: string, extensionsPath: string) {
  const extensionPath = path.join(extensionsPath, extensionId)
  let extensions = await discoverExtensions(extensionPath)
  extensions = filterOutdatedExtensions(extensions)
  return extensions.length > 0 ? extensions[0] : null
}
