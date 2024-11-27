import * as fs from 'node:fs'
import * as path from 'node:path'

import { generateId } from './id'

const d = require('debug')('electron-chrome-web-store:loader')

type ExtensionPathInfo =
  | { type: 'store'; manifest: chrome.runtime.Manifest; path: string; id: string }
  | { type: 'unpacked'; manifest: chrome.runtime.Manifest; path: string }

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

  // Get top level directories
  const subDirectories = await fs.promises.readdir(extensionsPath, {
    withFileTypes: true,
  })

  // Find all directories containing extension manifest.json
  // Limits search depth to 1-2.
  const extensionDirectories = await Promise.all(
    subDirectories
      .filter((dirEnt) => dirEnt.isDirectory())
      .map(async (dirEnt) => {
        const extPath = path.join(extensionsPath, dirEnt.name)

        // Check if manifest exists in root directory
        if (await manifestExists(extPath)) {
          return extPath
        }

        // Check one level deeper
        const extSubDirs = await fs.promises.readdir(extPath, {
          withFileTypes: true,
        })

        // Look for manifest in each subdirectory
        for (const subDir of extSubDirs) {
          if (!subDir.isDirectory()) continue

          const subDirPath = path.join(extPath, subDir.name)
          if (await manifestExists(subDirPath)) {
            return subDirPath
          }
        }
      }),
  )

  const results: ExtensionPathInfo[] = []

  for (const extPath of extensionDirectories.filter(Boolean)) {
    console.log(`Loading extension from ${extPath}`)
    try {
      const manifestPath = path.join(extPath!, 'manifest.json')
      const manifestJson = (await fs.promises.readFile(manifestPath)).toString()
      const manifest: chrome.runtime.Manifest = JSON.parse(manifestJson)
      if (manifest.key) {
        results.push({
          type: 'store',
          path: extPath!,
          manifest,
          id: generateId(manifest.key),
        })
      } else {
        results.push({
          type: 'unpacked',
          path: extPath!,
          manifest,
        })
      }
    } catch (e) {
      console.error(e)
    }
  }

  return results
}

/**
 * Load all extensions from the given directory.
 */
export async function loadAllExtensions(
  session: Electron.Session,
  extensionsPath: string,
  allowUnpacked: boolean,
) {
  const extensions = await discoverExtensions(extensionsPath)
  d('discovered %d extension(s) in %s', extensions.length, extensionsPath)

  for (const ext of extensions) {
    try {
      if (ext.type === 'store') {
        const existingExt = session.getExtension(ext.id)
        if (existingExt) {
          d('skipping loading existing extension %s', ext.id)
          continue
        }
        d('loading extension %s', ext.id)
        await session.loadExtension(ext.path)
      } else if (allowUnpacked) {
        d('loading unpacked extension %s', ext.path)
        await session.loadExtension(ext.path)
      }
    } catch (error) {
      console.error(`Failed to load extension from ${ext.path}`)
      console.error(error)
    }
  }
}
