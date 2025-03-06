import { app, session as electronSession } from 'electron'
import * as path from 'node:path'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

import { registerWebStoreApi } from './api'
import { loadAllExtensions } from './loader'
export { loadAllExtensions } from './loader'
export { installExtension, uninstallExtension, downloadExtension } from './installer'
import { initUpdater } from './updater'
export { updateExtensions } from './updater'
import { getDefaultExtensionsPath } from './utils'
import { BeforeInstall, ExtensionId, WebStoreState } from './types'

function resolvePreloadPath(modulePath?: string) {
  // Attempt to resolve preload path from module exports
  try {
    return createRequire(__dirname).resolve('electron-chrome-web-store/preload')
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(error)
    }
  }

  const preloadFilename = 'chrome-web-store.preload.js'

  // Deprecated: use modulePath if provided
  if (modulePath) {
    process.emitWarning(
      'electron-chrome-web-store: "modulePath" is deprecated and will be removed in future versions.',
      { type: 'DeprecationWarning' },
    )
    return path.join(modulePath, 'dist', preloadFilename)
  }

  // Fallback to preload relative to entrypoint directory
  return path.join(__dirname, preloadFilename)
}

interface ElectronChromeWebStoreOptions {
  /**
   * Session to enable the Chrome Web Store in.
   * Defaults to session.defaultSession
   */
  session?: Electron.Session

  /**
   * Path to the 'electron-chrome-web-store' module.
   *
   * @deprecated See "Packaging the preload script" in the readme.
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

  /**
   * Called prior to installing an extension. If implemented, return a Promise
   * which resolves with `{ action: 'allow' | 'deny' }` depending on the action
   * to be taken.
   */
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
  const preloadPath = resolvePreloadPath(opts.modulePath)

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

  if (!existsSync(preloadPath)) {
    console.error(
      new Error(
        `electron-chrome-web-store: Preload file not found at "${preloadPath}". ` +
          'See "Packaging the preload script" in the readme.',
      ),
    )
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
