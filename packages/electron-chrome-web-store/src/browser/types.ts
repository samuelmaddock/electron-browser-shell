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

export type AfterInstall = (details: ExtensionInstallDetails) => Promise<void>

export type AfterUninstall = (details: { id: ExtensionId }) => Promise<void>

export type ExtensionStatusDetails = {
  session: Electron.Session
  extensionsPath: string
}

export type CustomSetExtensionEnabled = (
  extensionId: ExtensionId,
  details: ExtensionStatusDetails,
  enabled: boolean,
) => Promise<void>

export type OverrideExtensionInstallStatus = (
  extensionId: ExtensionId,
  details: ExtensionStatusDetails,
  manifest?: chrome.runtime.Manifest,
) => string | undefined

export interface WebStoreState {
  session: Electron.Session
  extensionsPath: string
  installing: Set<ExtensionId>
  allowlist?: Set<ExtensionId>
  denylist?: Set<ExtensionId>
  minimumManifestVersion: number
  beforeInstall?: BeforeInstall
  afterInstall?: AfterInstall
  afterUninstall?: AfterUninstall
  customSetExtensionEnabled?: CustomSetExtensionEnabled
  overrideExtensionInstallStatus?: OverrideExtensionInstallStatus
}
