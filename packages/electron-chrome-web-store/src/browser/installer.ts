import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

import Pbf from 'pbf'

import { readCrxFileHeader, readSignedData } from './crx3'
import { convertHexadecimalToIDAlphabet, generateId } from './id'
import { fetch, getChromeVersion } from './utils'

const AdmZip = require('adm-zip')

function getCrxDownloadURL(extensionId: ExtensionId) {
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

    publicKey = keyProof.public_key
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

export async function downloadCrx(url: string, destDir: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Failed to download extension')
  }

  const downloadUuid = crypto.randomUUID()
  const tmpCrxPath = path.join(os.tmpdir(), `electron-cws-download_${downloadUuid}.crx`)

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

/**
 * Download extension ID from the Chrome Web Store to the given destination.
 *
 * @param extensionId Extension ID.
 * @param destDir Destination directory. Directory is expected to exist.
 */
export async function downloadExtension(extensionId: string, destDir: string) {
  const url = getCrxDownloadURL(extensionId)
  await downloadCrx(url, destDir)
}
