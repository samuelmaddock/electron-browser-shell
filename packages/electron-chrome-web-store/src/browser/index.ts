import { app, ipcMain, net, session as electronSession } from 'electron'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { readCrxFileHeader } from './crx3'
import Pbf from 'pbf'
import {
  ExtensionInstallStatus,
  MV2DeprecationStatus,
  Result,
  WebGlStatus,
} from '../common/constants'

const d = require('debug')('electron-chrome-web-store')
const AdmZip = require('adm-zip')

const WEBSTORE_URL = 'https://chromewebstore.google.com'

function getExtensionInfo(ext: Electron.Extension) {
  const manifest: chrome.runtime.Manifest = ext.manifest
  return {
    description: manifest.description || '',
    enabled: !manifest.disabled,
    homepageUrl: manifest.homepage_url || '',
    hostPermissions: manifest.host_permissions || [],
    icons: Object.entries(manifest?.icons || {}).map(([size, url]) => ({
      size: parseInt(size),
      url: `chrome://extension-icon/${ext.id}/${size}/0`,
    })),
    id: ext.id,
    installType: 'normal',
    isApp: !!manifest.app,
    mayDisable: true,
    name: manifest.name,
    offlineEnabled: !!manifest.offline_enabled,
    optionsUrl: manifest.options_page
      ? `chrome-extension://${ext.id}/${manifest.options_page}`
      : '',
    permissions: manifest.permissions || [],
    shortName: manifest.short_name || manifest.name,
    type: manifest.app ? 'app' : 'extension',
    updateUrl: manifest.update_url || '',
    version: manifest.version,
  }
}

async function fetchCrx(extensionId: string) {
  // Download extension from Chrome Web Store
  const chromeVersion = process.versions.chrome
  const response = await net.fetch(
    `https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3&x=id%3D${extensionId}%26uc&prodversion=${chromeVersion}`
  )

  if (!response.ok) {
    throw new Error('Failed to download extension')
  }

  return response
}

interface CrxInfo {
  version: number
  header: Buffer
  contents: Buffer
  publicKey: Buffer
}

// Parse CRX header and extract contents
function parseCrx(buffer: Buffer): CrxInfo {
  // CRX3 magic number: 'Cr24'
  const magicNumber = buffer.toString('utf8', 0, 4)
  if (magicNumber !== 'Cr24') {
    throw new Error('Invalid CRX format')
  }

  // CRX3 format has version = 3 and header size at bytes 8-12
  const version = buffer.readUInt32LE(4)
  const headerSize = buffer.readUInt32LE(8)

  // Extract header and contents
  const header = buffer.subarray(12, 12 + headerSize)
  const contents = buffer.subarray(12 + headerSize)

  // For CRX2 format
  let publicKey: Buffer
  if (version === 2) {
    const pubKeyLength = buffer.readUInt32LE(8)
    const sigLength = buffer.readUInt32LE(12)
    publicKey = buffer.subarray(16, 16 + pubKeyLength)
  } else {
    // For CRX3, extract public key from header
    // CRX3 header contains a protocol buffer message
    const pbf = new Pbf(header)
    const crxFileHeader = readCrxFileHeader(pbf)
    publicKey = crxFileHeader.sha256_with_rsa[1]?.public_key

    if (!publicKey) {
      throw new Error('Invalid CRX header')
    }
  }

  return {
    version,
    header,
    contents,
    publicKey,
  }
}

// Extract CRX contents and update manifest
async function extractCrx(crx: CrxInfo, destPath: string) {
  // Create zip file from contents
  const zip = new AdmZip(crx.contents)

  // Extract zip to destination
  zip.extractAllTo(destPath, true)

  // Read manifest.json
  const manifestPath = path.join(destPath, 'manifest.json')
  const manifestContent = await fs.promises.readFile(manifestPath, 'utf8')
  const manifestJson = JSON.parse(manifestContent)

  // Add public key to manifest
  manifestJson.key = crx.publicKey.toString('base64')

  // Write updated manifest back
  await fs.promises.writeFile(manifestPath, JSON.stringify(manifestJson, null, 2))
}

async function unpackCrx(crxPath: string, destDir: string) {
  // Read and parse CRX file
  const crxBuffer = await fs.promises.readFile(crxPath)
  const crx = await parseCrx(crxBuffer)
  await extractCrx(crx, destDir)
}

/**
 * Download extension ID from the Chrome Web Store to the given destination.
 *
 * @param extensionId Extension ID.
 * @param destDir Destination directory. Directory is expected to exist.
 */
export async function downloadExtension(extensionId: string, destDir: string) {
  const response = await fetchCrx(extensionId)
  const tmpCrxPath = path.join(os.tmpdir(), `electron-cws-download_${extensionId}.crx`)

  try {
    // Save extension file
    const fileStream = fs.createWriteStream(tmpCrxPath)

    // Convert ReadableStream to Node stream and pipe to file
    const downloadStream = Readable.fromWeb(response.body as any)
    await pipeline(downloadStream, fileStream)

    await unpackCrx(tmpCrxPath, destDir)
  } finally {
    await fs.promises.rm(tmpCrxPath, { force: true })
  }
}

async function uninstallExtension(
  session: Electron.Session,
  extensionId: string,
  extensionsPath: string
) {
  const extensions = session.getAllExtensions()
  const existingExt = extensions.find((ext) => ext.id === extensionId)
  if (existingExt) {
    await session.removeExtension(extensionId)
  }

  const extensionDir = path.join(extensionsPath, extensionId)
  try {
    const stat = await fs.promises.stat(extensionDir)
    if (stat.isDirectory()) {
      await fs.promises.rm(extensionDir, { recursive: true, force: true })
    }
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      console.error(error)
    }
  }
}

interface InstallDetails {
  id: string
  manifest: string
  localizedName: string
  esbAllowlist: boolean
  iconUrl: string
}

async function beginInstall(
  session: Electron.Session,
  details: InstallDetails,
  extensionsPath: string
) {
  try {
    const extensionId = details.id
    const manifest: chrome.runtime.Manifest = JSON.parse(details.manifest)
    const installVersion = manifest.version

    // Check if extension is already loaded in session and remove it
    await uninstallExtension(session, extensionId, extensionsPath)

    // Create extension directory
    const unpackedDir = path.join(extensionsPath, extensionId, `${installVersion}_0`)
    await fs.promises.mkdir(unpackedDir, { recursive: true })

    await downloadExtension(extensionId, unpackedDir)

    // Load extension into session
    await session.loadExtension(unpackedDir)

    return { result: Result.SUCCESS }
  } catch (error) {
    console.error('Extension installation failed:', error)
    return {
      result: Result.INSTALL_ERROR,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

interface ElectronChromeWebStoreOptions {
  /**
   * Session to enable the Chrome Web Store in.
   * Defaults to session.defaultSession
   */
  session?: Electron.Session

  /**
   * Path to the 'electron-chrome-web-store' module.
   */
  modulePath?: string

  /**
   * Path to extensions directory.
   * Defaults to 'Extensions/' under userData path.
   */
  extensionsPath?: string
}

/**
 * Install Chrome Web Store support.
 *
 * @param options Chrome Web Store configuration options.
 */
export function installChromeWebStore(opts: ElectronChromeWebStoreOptions = {}) {
  const session = opts.session || electronSession.defaultSession
  const extensionsPath = opts.extensionsPath || path.join(app.getPath('userData'), 'Extensions')
  const modulePath = opts.modulePath || __dirname

  // Add preload script to session
  const preloadPath = path.join(modulePath, 'dist/renderer/web-store-preload.js')
  session.setPreloads([...session.getPreloads(), preloadPath])

  /** Handle IPCs from the Chrome Web Store. */
  const handle = (
    channel: string,
    handle: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any
  ) => {
    ipcMain.handle(channel, function handleWebStoreIpc(event, ...args) {
      d('received %s', channel)

      const senderOrigin = event.senderFrame?.origin
      if (!senderOrigin || !senderOrigin.startsWith(WEBSTORE_URL)) {
        d('ignoring webstore request from %s', senderOrigin)
        return
      }

      return handle(event, ...args)
    })
  }

  handle('chromeWebstore.beginInstall', async (event, details: InstallDetails) => {
    const { senderFrame } = event

    d('beginInstall', details)

    const result = await beginInstall(session, details, extensionsPath)

    if (result.result === Result.SUCCESS) {
      queueMicrotask(() => {
        const ext = session.getExtension(details.id)
        if (ext) {
          // TODO: use WebFrameMain.isDestroyed
          try {
            senderFrame.send('chrome.management.onInstalled', getExtensionInfo(ext))
          } catch (error) {
            console.error(error)
          }
        }
      })
    }

    return result
  })

  handle('chromeWebstore.completeInstall', async (event, id) => {
    // TODO: Implement completion of extension installation
    return Result.SUCCESS
  })

  handle('chromeWebstore.enableAppLauncher', async (event, enable) => {
    // TODO: Implement app launcher enable/disable
    return true
  })

  handle('chromeWebstore.getBrowserLogin', async () => {
    // TODO: Implement getting browser login
    return ''
  })
  handle('chromeWebstore.getExtensionStatus', async (event, id, manifestJson) => {
    console.log('webstorePrivate.getExtensionStatus', JSON.stringify({ id }))
    const extensions = session.getAllExtensions()
    const extension = extensions.find((ext) => ext.id === id)

    if (!extension) {
      console.log(
        'webstorePrivate.getExtensionStatus result:',
        id,
        ExtensionInstallStatus.INSTALLABLE
      )
      return ExtensionInstallStatus.INSTALLABLE
    }

    if (extension.manifest.disabled) {
      console.log('webstorePrivate.getExtensionStatus result:', id, ExtensionInstallStatus.DISABLED)
      return ExtensionInstallStatus.DISABLED
    }

    console.log('webstorePrivate.getExtensionStatus result:', id, ExtensionInstallStatus.ENABLED)
    return ExtensionInstallStatus.ENABLED
  })

  handle('chromeWebstore.getFullChromeVersion', async () => {
    return { version_number: process.versions.chrome }
  })

  handle('chromeWebstore.getIsLauncherEnabled', async () => {
    // TODO: Implement checking if launcher is enabled
    return true
  })

  handle('chromeWebstore.getMV2DeprecationStatus', async () => {
    return MV2DeprecationStatus.INACTIVE
  })

  handle('chromeWebstore.getReferrerChain', async () => {
    // TODO: Implement getting referrer chain
    return 'EgIIAA=='
  })

  handle('chromeWebstore.getStoreLogin', async () => {
    // TODO: Implement getting store login
    return ''
  })

  handle('chromeWebstore.getWebGLStatus', async () => {
    await app.getGPUInfo('basic')
    const features = app.getGPUFeatureStatus()
    return features.webgl.startsWith('enabled')
      ? WebGlStatus.WEBGL_ALLOWED
      : WebGlStatus.WEBGL_BLOCKED
  })

  handle('chromeWebstore.install', async (event, id, silentInstall) => {
    // TODO: Implement extension installation
    return Result.SUCCESS
  })

  handle('chromeWebstore.isInIncognitoMode', async () => {
    // TODO: Implement incognito mode check
    return false
  })

  handle('chromeWebstore.isPendingCustodianApproval', async (event, id) => {
    // TODO: Implement custodian approval check
    return false
  })

  handle('chromeWebstore.setStoreLogin', async (event, login) => {
    // TODO: Implement setting store login
    return true
  })

  handle('chrome.runtime.getManifest', async () => {
    // TODO: Implement getting extension manifest
    return {}
  })

  handle('chrome.management.getAll', async (event) => {
    const extensions = session.getAllExtensions()
    return extensions.map(getExtensionInfo)
  })

  handle('chrome.management.setEnabled', async (event, id, enabled) => {
    // TODO: Implement enabling/disabling extension
    return true
  })

  handle(
    'chrome.management.uninstall',
    async (event, id, options: { showConfirmDialog: boolean }) => {
      if (options?.showConfirmDialog) {
        // TODO: confirmation dialog
      }

      try {
        await uninstallExtension(session, id, extensionsPath)
        queueMicrotask(() => {
          event.sender.send('chrome.management.onUninstalled', id)
        })
        return Result.SUCCESS
      } catch (error) {
        console.error(error)
        return Result.UNKNOWN_ERROR
      }
    }
  )
}

/**
 * @deprecated Use `installChromeWebStore`
 */
export function setupChromeWebStore(session: Electron.Session, modulePath?: string) {
  installChromeWebStore({ session, modulePath })
}
