export type ExtensionId = Electron.Extension['id']

export interface WebStoreState {
  session: Electron.Session
  extensionsPath: string
  installing: Set<ExtensionId>
  allowlist?: Set<ExtensionId>
  denylist?: Set<ExtensionId>
}
