import { app, ipcMain, net, BrowserWindow, Session } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { Readable } from 'stream'
import { readCrxFileHeader } from './crx3'
import Pbf from 'pbf'

const AdmZip = require('adm-zip')

const ExtensionInstallStatus = {
  BLACKLISTED: 'blacklisted',
  BLOCKED_BY_POLICY: 'blocked_by_policy',
  CAN_REQUEST: 'can_request',
  CORRUPTED: 'corrupted',
  CUSTODIAN_APPROVAL_REQUIRED: 'custodian_approval_required',
  CUSTODIAN_APPROVAL_REQUIRED_FOR_INSTALLATION: 'custodian_approval_required_for_installation',
  DEPRECATED_MANIFEST_VERSION: 'deprecated_manifest_version',
  DISABLED: 'disabled',
  ENABLED: 'enabled',
  FORCE_INSTALLED: 'force_installed',
  INSTALLABLE: 'installable',
  REQUEST_PENDING: 'request_pending',
  TERMINATED: 'terminated',
}

const MV2DeprecationStatus = {
  INACTIVE: 'inactive',
  SOFT_DISABLE: 'soft_disable',
  WARNING: 'warning',
}

const Result = {
  ALREADY_INSTALLED: 'already_installed',
  BLACKLISTED: 'blacklisted',
  BLOCKED_BY_POLICY: 'blocked_by_policy',
  BLOCKED_FOR_CHILD_ACCOUNT: 'blocked_for_child_account',
  FEATURE_DISABLED: 'feature_disabled',
  ICON_ERROR: 'icon_error',
  INSTALL_ERROR: 'install_error',
  INSTALL_IN_PROGRESS: 'install_in_progress',
  INVALID_ICON_URL: 'invalid_icon_url',
  INVALID_ID: 'invalid_id',
  LAUNCH_IN_PROGRESS: 'launch_in_progress',
  MANIFEST_ERROR: 'manifest_error',
  MISSING_DEPENDENCIES: 'missing_dependencies',
  SUCCESS: 'success',
  UNKNOWN_ERROR: 'unknown_error',
  UNSUPPORTED_EXTENSION_TYPE: 'unsupported_extension_type',
  USER_CANCELLED: 'user_cancelled',
  USER_GESTURE_REQUIRED: 'user_gesture_required',
}

const WebGlStatus = {
  WEBGL_ALLOWED: 'webgl_allowed',
  WEBGL_BLOCKED: 'webgl_blocked',
}

export function setupChromeWebStore(session: Session, modulePath: string = __dirname) {
  const preloadPath = path.join(modulePath, 'dist/renderer/web-store-api.js')

  // Add preload script to session
  session.setPreloads([...session.getPreloads(), preloadPath])

  async function uninstallExtension(id: string) {
    const extensions = session.getAllExtensions()
    const existingExt = extensions.find((ext) => ext.id === id)
    if (existingExt) {
      await session.removeExtension(id)
    }

    const userDataPath = app.getPath('userData')
    const extensionDir = path.join(userDataPath, 'Extensions', id)
    await fs.promises.rm(extensionDir, { recursive: true, force: true })
  }

  interface InstallDetails {
    id: string
    manifest: string
    localizedName: string
    esbAllowlist: boolean
    iconUrl: string
  }

  ipcMain.handle('chromeWebstore.beginInstall', async (event, details: InstallDetails) => {
    try {
      const manifest: chrome.runtime.Manifest = JSON.parse(details.manifest)
      const installVersion = manifest.version

      // Check if extension is already loaded in session and remove it
      await uninstallExtension(details.id)

      // Get user data directory and ensure extensions folder exists
      const userDataPath = app.getPath('userData')
      const extensionsPath = path.join(userDataPath, 'Extensions')
      await fs.promises.mkdir(extensionsPath, { recursive: true })

      // Create extension directory
      const extensionDir = path.join(extensionsPath, details.id)
      await fs.promises.mkdir(extensionDir, { recursive: true })

      // Download extension from Chrome Web Store
      const chromeVersion = process.versions.chrome
      const response = await net.fetch(
        `https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3&x=id%3D${details.id}%26uc&prodversion=${chromeVersion}`
      )

      if (!response.ok) {
        throw new Error('Failed to download extension')
      }

      // Save extension file
      const extensionFile = path.join(extensionDir, 'extension.crx')
      const fileStream = fs.createWriteStream(extensionFile)

      // Convert ReadableStream to Node stream and pipe to file
      const readableStream = Readable.fromWeb(response.body as any)
      await new Promise((resolve, reject) => {
        readableStream.pipe(fileStream)
        readableStream.on('error', reject)
        fileStream.on('finish', resolve)
      })

      // Unpack extension
      const unpackedDir = path.join(extensionDir, `${installVersion}_0`)
      await fs.promises.mkdir(unpackedDir, { recursive: true })

      // Read and parse CRX file
      const crxBuffer = await fs.promises.readFile(extensionFile)

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

      const crx = await parseCrx(crxBuffer)
      await extractCrx(crx, unpackedDir)

      // Load extension into session
      await session.loadExtension(unpackedDir)

      return Result.SUCCESS
    } catch (error) {
      console.error('Extension installation failed:', error)
      return Result.INSTALL_ERROR
    }
  })

  ipcMain.handle('chromeWebstore.completeInstall', async (event, id) => {
    // TODO: Implement completion of extension installation
    return Result.SUCCESS
  })

  ipcMain.handle('chromeWebstore.enableAppLauncher', async (event, enable) => {
    // TODO: Implement app launcher enable/disable
    return true
  })

  ipcMain.handle('chromeWebstore.getBrowserLogin', async () => {
    // TODO: Implement getting browser login
    return ''
  })
  ipcMain.handle('chromeWebstore.getExtensionStatus', async (event, id, manifestJson) => {
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

  ipcMain.handle('chromeWebstore.getFullChromeVersion', async () => {
    return { version_number: process.versions.chrome }
  })

  ipcMain.handle('chromeWebstore.getIsLauncherEnabled', async () => {
    // TODO: Implement checking if launcher is enabled
    return true
  })

  ipcMain.handle('chromeWebstore.getMV2DeprecationStatus', async () => {
    // TODO: Implement MV2 deprecation status check
    return MV2DeprecationStatus.INACTIVE
  })

  ipcMain.handle('chromeWebstore.getReferrerChain', async () => {
    // TODO: Implement getting referrer chain
    return 'EgIIAA=='
  })

  ipcMain.handle('chromeWebstore.getStoreLogin', async () => {
    // TODO: Implement getting store login
    return ''
  })

  ipcMain.handle('chromeWebstore.getWebGLStatus', async () => {
    // TODO: Implement WebGL status check
    return WebGlStatus.WEBGL_ALLOWED
  })

  ipcMain.handle('chromeWebstore.install', async (event, id, silentInstall) => {
    // TODO: Implement extension installation
    return Result.SUCCESS
  })

  ipcMain.handle('chromeWebstore.isInIncognitoMode', async () => {
    // TODO: Implement incognito mode check
    return false
  })

  ipcMain.handle('chromeWebstore.isPendingCustodianApproval', async (event, id) => {
    // TODO: Implement custodian approval check
    return false
  })

  ipcMain.handle('chromeWebstore.setStoreLogin', async (event, login) => {
    // TODO: Implement setting store login
    return true
  })

  ipcMain.handle('chrome.runtime.getManifest', async () => {
    // TODO: Implement getting extension manifest
    return {}
  })

  ipcMain.handle('chrome.management.getAll', async (event) => {
    const extensions = session.getAllExtensions()

    return extensions.map((ext) => {
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
    })
  })

  ipcMain.handle('chrome.management.setEnabled', async (event, id, enabled) => {
    // TODO: Implement enabling/disabling extension
    return true
  })

  ipcMain.handle(
    'chrome.management.uninstall',
    async (event, id, options: { showConfirmDialog: boolean }) => {
      if (options?.showConfirmDialog) {
        // TODO: confirmation dialog
      }

      try {
        await uninstallExtension(id)
        return Result.SUCCESS
      } catch (error) {
        console.error(error)
        return Result.UNKNOWN_ERROR
      }
    }
  )

  // Handle extension install/uninstall events
  function emitExtensionEvent(eventName: string) {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(`chrome.management.${eventName}`)
    })
  }
}
