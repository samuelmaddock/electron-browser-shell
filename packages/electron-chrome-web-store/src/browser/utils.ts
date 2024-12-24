import * as path from 'node:path'
import { app, net } from 'electron'

// Include fallbacks for node environments that aren't Electron
export const fetch =
  // Prefer Node's fetch until net.fetch crash is fixed
  // https://github.com/electron/electron/pull/45050
  globalThis.fetch ||
  net?.fetch ||
  (() => {
    throw new Error(
      'electron-chrome-web-store: Missing fetch API. Please upgrade Electron or Node.',
    )
  })
export const getChromeVersion = () => process.versions.chrome || '131.0.6778.109'

export function compareVersions(version1: string, version2: string) {
  const v1 = version1.split('.').map(Number)
  const v2 = version2.split('.').map(Number)

  for (let i = 0; i < 3; i++) {
    if (v1[i] > v2[i]) return 1
    if (v1[i] < v2[i]) return -1
  }
  return 0
}

export const getDefaultExtensionsPath = () => path.join(app.getPath('userData'), 'Extensions')
