export type ExtensionId = Electron.Extension['id']

export interface ExtensionInstallDetails {
  id: string
  localizedName: string
  manifest: chrome.runtime.Manifest
  icon: Electron.NativeImage
  browserWindow?: Electron.BrowserWindow
  frame: Electron.WebFrameMain
}

export type BeforeInstall = (
  details: ExtensionInstallDetails,
) => Promise<{ action: 'allow' | 'deny' }>

export interface WebStoreState {
  session: Electron.Session
  extensionsPath: string
  installing: Set<ExtensionId>
  allowlist?: Set<ExtensionId>
  denylist?: Set<ExtensionId>
  minimumManifestVersion: number
  beforeInstall?: BeforeInstall
}
