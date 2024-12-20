import { net } from 'electron'

// Include fallbacks for node environments that aren't Electron
export const fetch = net?.fetch || globalThis.fetch
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
