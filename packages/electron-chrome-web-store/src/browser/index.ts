import { app, session as electronSession } from 'electron'
import * as path from 'node:path'

import { registerWebStoreApi } from './api'
import { loadAllExtensions } from './loader'
export { loadAllExtensions } from './loader'
export { installExtension, downloadExtension } from './installer'
import { initUpdater } from './updater'
export { updateExtensions } from './updater'
import { getDefaultExtensionsPath } from './utils'
import { BeforeInstall, ExtensionId, WebStoreState } from './types'

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
   * Defaults to 'Extensions/' under app's userData path.
   */
  extensionsPath?: string

  /**
   * Load extensions installed by Chrome Web Store.
   * Defaults to true.
   */
  loadExtensions?: boolean

  /**
   * Whether to allow loading unpacked extensions. Only loads if
   * `loadExtensions` is also enabled.
   * Defaults to false.
   */
  allowUnpackedExtensions?: boolean

  /**
   * List of allowed extension IDs to install.
   */
  allowlist?: ExtensionId[]

  /**
   * List of denied extension IDs to install.
   */
  denylist?: ExtensionId[]

  /**
   * Whether extensions should auto-update.
   */
  autoUpdate?: boolean

  /**
   * Minimum supported version of Chrome extensions.
   * Defaults to 3.
   */
  minimumManifestVersion?: number

  beforeInstall?: BeforeInstall
}

/**
 * Install Chrome Web Store support.
 *
 * @param options Chrome Web Store configuration options.
 */
export async function installChromeWebStore(opts: ElectronChromeWebStoreOptions = {}) {
  const session = opts.session || electronSession.defaultSession
  const extensionsPath = opts.extensionsPath || getDefaultExtensionsPath()
  const modulePath = opts.modulePath || __dirname
  const loadExtensions = typeof opts.loadExtensions === 'boolean' ? opts.loadExtensions : true
  const allowUnpackedExtensions =
    typeof opts.allowUnpackedExtensions === 'boolean' ? opts.allowUnpackedExtensions : false
  const autoUpdate = typeof opts.autoUpdate === 'boolean' ? opts.autoUpdate : true
  const minimumManifestVersion =
    typeof opts.minimumManifestVersion === 'number' ? opts.minimumManifestVersion : 3
  const beforeInstall = typeof opts.beforeInstall === 'function' ? opts.beforeInstall : undefined

  const webStoreState: WebStoreState = {
    session,
    extensionsPath,
    installing: new Set(),
    allowlist: opts.allowlist ? new Set(opts.allowlist) : undefined,
    denylist: opts.denylist ? new Set(opts.denylist) : undefined,
    minimumManifestVersion,
    beforeInstall,
  }

  // Add preload script to session
  const preloadPath = path.join(modulePath, 'dist/renderer/web-store-preload.js')

  if ('registerPreloadScript' in session) {
    session.registerPreloadScript({
      id: 'electron-chrome-web-store',
      type: 'frame',
      filePath: preloadPath,
    })
  } else {
    // @ts-expect-error Deprecated electron@<35
    session.setPreloads([...session.getPreloads(), preloadPath])
  }

  registerWebStoreApi(webStoreState)

  await app.whenReady()

  if (loadExtensions) {
    await loadAllExtensions(session, extensionsPath, { allowUnpacked: allowUnpackedExtensions })
  }

  if (autoUpdate) {
    void initUpdater(webStoreState)
  }
}
