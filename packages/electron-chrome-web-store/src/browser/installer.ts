import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { session as electronSession } from 'electron'

import AdmZip from 'adm-zip'
import debug from 'debug'
import Pbf from 'pbf'

import { readCrxFileHeader, readSignedData } from './crx3'
import { convertHexadecimalToIDAlphabet, generateId } from './id'
import { fetch, getChromeVersion, getDefaultExtensionsPath } from './utils'
import { findExtensionInstall } from './loader'
import { ExtensionId } from './types'

const d = debug('electron-chrome-web-store:installer')

function getExtensionCrxURL(extensionId: ExtensionId) {
  const url = new URL('https://clients2.google.com/service/update2/crx')
  url.searchParams.append('response', 'redirect')
  url.searchParams.append('acceptformat', ['crx2', 'crx3'].join(','))

  const x = new URLSearchParams()
  x.append('id', extensionId)
  x.append('uc', '')

  url.searchParams.append('x', x.toString())
  url.searchParams.append('prodversion', getChromeVersion())

  return url.toString()
}

interface CrxInfo {
  extensionId: string
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

  let extensionId: string
  let publicKey: Buffer

  // For CRX2 format
  if (version === 2) {
    const pubKeyLength = buffer.readUInt32LE(8)
    const sigLength = buffer.readUInt32LE(12)
    publicKey = buffer.subarray(16, 16 + pubKeyLength)
    extensionId = generateId(publicKey.toString('base64'))
  } else {
    // For CRX3, extract public key from header
    // CRX3 header contains a protocol buffer message
    const crxFileHeader = readCrxFileHeader(new Pbf(header))
    const crxSignedData = readSignedData(new Pbf(crxFileHeader.signed_header_data))
    const declaredCrxId = crxSignedData.crx_id
      ? convertHexadecimalToIDAlphabet(crxSignedData.crx_id.toString('hex'))
      : null

    if (!declaredCrxId) {
      throw new Error('Invalid CRX signed data')
    }

    // Need to find store key proof which matches the declared ID
    const keyProof = crxFileHeader.sha256_with_rsa.find((proof) => {
      const crxId = proof.public_key ? generateId(proof.public_key.toString('base64')) : null
      return crxId === declaredCrxId
    })

    if (!keyProof) {
      throw new Error('Invalid CRX key')
    }

    extensionId = declaredCrxId
    publicKey = keyProof.public_key
  }

  return {
    extensionId,
    version,
    header,
    contents,
    publicKey,
  }
}

// Extract CRX contents and update manifest
async function unpackCrx(crx: CrxInfo, destPath: string): Promise<chrome.runtime.Manifest> {
  // Create zip file from contents
  const zip = new AdmZip(crx.contents)

  // Extract zip to destination
  zip.extractAllTo(destPath, true)

  // Read manifest.json
  const manifestPath = path.join(destPath, 'manifest.json')
  const manifestContent = await fs.promises.readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(manifestContent) as chrome.runtime.Manifest

  // Add public key to manifest
  manifest.key = crx.publicKey.toString('base64')

  // Write updated manifest back
  await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2))

  return manifest
}

async function readCrx(crxPath: string) {
  const crxBuffer = await fs.promises.readFile(crxPath)
  return parseCrx(crxBuffer)
}

async function downloadCrx(url: string, dest: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Failed to download extension')
  }

  const fileStream = fs.createWriteStream(dest)
  const downloadStream = Readable.fromWeb(response.body as any)
  await pipeline(downloadStream, fileStream)
}

export async function downloadExtensionFromURL(
  url: string,
  extensionsDir: string,
  expectedExtensionId?: string,
): Promise<string> {
  d('downloading %s', url)

  const installUuid = crypto.randomUUID()
  const crxPath = path.join(os.tmpdir(), `electron-cws-download_${installUuid}.crx`)
  try {
    await downloadCrx(url, crxPath)

    const crx = await readCrx(crxPath)

    if (expectedExtensionId && expectedExtensionId !== crx.extensionId) {
      throw new Error(
        `CRX mismatches expected extension ID: ${expectedExtensionId} !== ${crx.extensionId}`,
      )
    }

    const unpackedPath = path.join(extensionsDir, crx.extensionId, installUuid)
    await fs.promises.mkdir(unpackedPath, { recursive: true })
    const manifest = await unpackCrx(crx, unpackedPath)

    if (!manifest.version) {
      throw new Error('Installed extension is missing manifest version')
    }

    const versionedPath = path.join(extensionsDir, crx.extensionId, `${manifest.version}_0`)
    await fs.promises.rename(unpackedPath, versionedPath)

    return versionedPath
  } finally {
    await fs.promises.rm(crxPath, { force: true })
  }
}

/**
 * Download and unpack extension to the given extensions directory.
 */
export async function downloadExtension(
  extensionId: string,
  extensionsDir: string,
): Promise<string> {
  const url = getExtensionCrxURL(extensionId)
  return await downloadExtensionFromURL(url, extensionsDir, extensionId)
}

interface CommonExtensionOptions {
  /** Session to load extensions into. */
  session?: Electron.Session

  /**
   * Directory where web store extensions will be installed.
   * Defaults to `Extensions` under the app's `userData` directory.
   */
  extensionsPath?: string
}

interface InstallExtensionOptions extends CommonExtensionOptions {
  /** Options for loading the extension. */
  loadExtensionOptions?: Electron.LoadExtensionOptions
}

interface UninstallExtensionOptions extends CommonExtensionOptions {}

/**
 * Install extension from the web store.
 */
export async function installExtension(
  extensionId: string,
  opts: InstallExtensionOptions = {},
): Promise<Electron.Extension> {
  d('installing %s', extensionId)

  const session = opts.session || electronSession.defaultSession
  const sessionExtensions = session.extensions || session
  const extensionsPath = opts.extensionsPath || getDefaultExtensionsPath()

  // Check if already loaded
  const existingExtension = sessionExtensions.getExtension(extensionId)
  if (existingExtension) {
    d('%s already loaded', extensionId)
    return existingExtension
  }

  // Check if already installed
  const existingExtensionInfo = await findExtensionInstall(extensionId, extensionsPath)
  if (existingExtensionInfo && existingExtensionInfo.type === 'store') {
    d('%s already installed', extensionId)
    return await sessionExtensions.loadExtension(
      existingExtensionInfo.path,
      opts.loadExtensionOptions,
    )
  }

  // Download and load new extension
  const extensionPath = await downloadExtension(extensionId, extensionsPath)
  const extension = await sessionExtensions.loadExtension(extensionPath, opts.loadExtensionOptions)
  d('installed %s', extensionId)

  return extension
}

/**
 * Uninstall extension from the web store.
 */
export async function uninstallExtension(
  extensionId: string,
  opts: UninstallExtensionOptions = {},
) {
  d('uninstalling %s', extensionId)

  const session = opts.session || electronSession.defaultSession
  const sessionExtensions = session.extensions || session
  const extensionsPath = opts.extensionsPath || getDefaultExtensionsPath()

  const extensions = sessionExtensions.getAllExtensions()
  const existingExt = extensions.find((ext) => ext.id === extensionId)
  if (existingExt) {
    sessionExtensions.removeExtension(extensionId)
  }

  const extensionDir = path.join(extensionsPath, extensionId)
  try {
    const stat = await fs.promises.stat(extensionDir)
    if (stat.isDirectory()) {
      await fs.promises.rm(extensionDir, { recursive: true, force: true })
    }
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
  }
}
