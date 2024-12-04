import { app, session as electronSession } from 'electron'
import * as path from 'path'

import { registerWebStoreApi } from './api'
import { loadAllExtensions } from './loader'
export { loadAllExtensions } from './loader'
import { initUpdater } from './updater'

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
}

/**
 * Install Chrome Web Store support.
 *
 * @param options Chrome Web Store configuration options.
 */
export async function installChromeWebStore(opts: ElectronChromeWebStoreOptions = {}) {
  const session = opts.session || electronSession.defaultSession
  const extensionsPath = opts.extensionsPath || path.join(app.getPath('userData'), 'Extensions')
  const modulePath = opts.modulePath || __dirname
  const loadExtensions = typeof opts.loadExtensions === 'boolean' ? opts.loadExtensions : true
  const allowUnpackedExtensions =
    typeof opts.allowUnpackedExtensions === 'boolean' ? opts.allowUnpackedExtensions : false
  const autoUpdate = typeof opts.autoUpdate === 'boolean' ? opts.autoUpdate : true

  const webStoreState: WebStoreState = {
    session,
    extensionsPath,
    installing: new Set(),
    allowlist: opts.allowlist ? new Set(opts.allowlist) : undefined,
    denylist: opts.denylist ? new Set(opts.denylist) : undefined,
  }

  // Add preload script to session
  const preloadPath = path.join(modulePath, 'dist/renderer/web-store-preload.js')

  if ('registerPreloadScript' in session) {
    ;(session as any).registerPreloadScript({
      id: 'electron-chrome-web-store',
      type: 'frame',
      filePath: preloadPath,
    })
  } else {
    // TODO(mv3): remove
    session.setPreloads([...session.getPreloads(), preloadPath])
  }

  registerWebStoreApi(webStoreState)

  await app.whenReady()

  if (loadExtensions) {
    await loadAllExtensions(session, extensionsPath, { allowUnpacked: allowUnpackedExtensions })
  }

  if (autoUpdate) {
    await initUpdater(webStoreState)
  }
}
