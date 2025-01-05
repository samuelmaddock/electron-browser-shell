import { app } from 'electron'
import * as nodeCrypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

const INTERNAL_LICENSE = 'internal-license-do-not-use'
const VALID_LICENSES_CONST = ['GPL-3.0', 'Patron-License-2020-11-19'] as const
const VALID_LICENSES = new Set(VALID_LICENSES_CONST)
export type License = (typeof VALID_LICENSES_CONST)[number]

/**
 * The following projects are not in compliance with the Patron license.
 *
 * This is included in the module as an offline check to block these projects
 * from freely consuming updates.
 */
const NONCOMPLIANT_PROJECTS = new Set([
  '9588cd7085bc3ae89f2c9cf8b7dee35a77a6747b4717be3d7b6b8f395c9ca1d8',
  '8cf1d008c4c5d4e8a6f32de274359cf4ac02fcb82aeffae10ff0b99553c9d745',
])

const getLicenseNotice =
  () => `Please select a distribution license compatible with your application.
Valid licenses include: ${Array.from(VALID_LICENSES).join(', ')}
See LICENSE.md for more details.`

function readPackageJson() {
  const appPath = app.getAppPath()
  const packageJsonPath = path.join(appPath, 'package.json')
  const rawData = fs.readFileSync(packageJsonPath, 'utf-8')
  return JSON.parse(rawData)
}

function generateHash(input: string) {
  const hash = nodeCrypto.createHash('sha256')
  hash.update('crx' + input)
  return hash.digest('hex')
}

/**
 * Check to ensure a valid license is provided.
 * @see LICENSE.md
 */
export function checkLicense(license?: unknown) {
  // License must be set
  if (!license || typeof license !== 'string') {
    throw new Error(`ElectronChromeExtensions: Missing 'license' property.\n${getLicenseNotice()}`)
  }

  // License must be valid
  if (!VALID_LICENSES.has(license as any) && (license as any) !== INTERNAL_LICENSE) {
    throw new Error(
      `ElectronChromeExtensions: Invalid 'license' property: ${license}\n${getLicenseNotice()}`,
    )
  }

  // Project must be in compliance with license
  let projectNameHash: string | undefined
  try {
    const packageJson = readPackageJson()
    const projectName = packageJson.name.toLowerCase()
    projectNameHash = generateHash(projectName)
  } catch {}
  if (projectNameHash && NONCOMPLIANT_PROJECTS.has(projectNameHash)) {
    throw new Error(
      `ElectronChromeExtensions: This application is using a non-compliant license. Contact sam@samuelmaddock.com if you wish to reinstate your license.`,
    )
  }
}
