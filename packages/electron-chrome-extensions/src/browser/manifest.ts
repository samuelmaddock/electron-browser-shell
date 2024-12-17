import { getExtensionUrl, validateExtensionResource } from './api/common'
import { ExtensionContext } from './context'

export async function readUrlOverrides(ctx: ExtensionContext, extension: Electron.Extension) {
  const manifest = extension.manifest as chrome.runtime.Manifest
  const urlOverrides = ctx.store.urlOverrides
  let updated = false

  if (typeof manifest.chrome_url_overrides === 'object') {
    for (const [name, uri] of Object.entries(manifest.chrome_url_overrides!)) {
      const validatedPath = await validateExtensionResource(extension, uri)
      if (!validatedPath) {
        console.error(
          `Extension ${extension.id} attempted to override ${name} with invalid resource: ${uri}`,
        )
        continue
      }

      const url = getExtensionUrl(extension, uri)!
      const currentUrl = urlOverrides[name]
      if (currentUrl !== url) {
        urlOverrides[name] = url
        updated = true
      }
    }
  }

  if (updated) {
    ctx.emit('url-overrides-updated', urlOverrides)
  }
}

export function readLoadedExtensionManifest(ctx: ExtensionContext, extension: Electron.Extension) {
  readUrlOverrides(ctx, extension)
}
