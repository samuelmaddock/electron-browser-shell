import { ExtensionContext } from '../context'
import { ExtensionEvent } from '../router'
import { originCovered, splitPermissions } from './lib/host-permissions'

type ManifestWithOptionalHosts = chrome.runtime.Manifest & {
  optional_host_permissions?: string[]
}

/**
 * This is a very basic implementation of the permissions API. Likely
 * more work will be needed to integrate with the native permissions.
 *
 * Host permissions are granted from `host_permissions` (MV3) and from match
 * patterns inside `permissions` (MV2). Requested origins are held when a
 * granted match pattern covers them, as in Chrome.
 */
export class PermissionsAPI {
  private permissionMap = new Map<
    /* extensionId */ string,
    {
      permissions: chrome.runtime.ManifestPermissions[]
      origins: string[]
    }
  >()

  constructor(private ctx: ExtensionContext) {
    const handle = this.ctx.router.apiHandler()
    handle('permissions.contains', this.contains)
    handle('permissions.getAll', this.getAll)
    handle('permissions.remove', this.remove)
    handle('permissions.request', this.request)

    const sessionExtensions = ctx.session.extensions || ctx.session
    sessionExtensions.getAllExtensions().forEach((ext) => this.processExtension(ext))

    sessionExtensions.on('extension-loaded', (_event, extension) => {
      this.processExtension(extension)
    })

    sessionExtensions.on('extension-unloaded', (_event, extension) => {
      this.permissionMap.delete(extension.id)
    })
  }

  private processExtension(extension: Electron.Extension) {
    const manifest: chrome.runtime.Manifest = extension.manifest
    const { permissions, origins } = splitPermissions(manifest.permissions || [])
    this.permissionMap.set(extension.id, {
      permissions: permissions as chrome.runtime.ManifestPermissions[],
      origins: [...new Set([...(manifest.host_permissions || []), ...origins])],
    })
  }

  private contains = (
    { extension }: ExtensionEvent,
    permissions: chrome.permissions.Permissions,
  ) => {
    const currentPermissions = this.permissionMap.get(extension.id)!
    const hasPermissions = permissions.permissions
      ? permissions.permissions.every((permission) =>
          currentPermissions.permissions.includes(permission),
        )
      : true
    const hasOrigins = permissions.origins
      ? permissions.origins.every((origin) => originCovered(currentPermissions.origins, origin))
      : true
    return hasPermissions && hasOrigins
  }

  private getAll = ({ extension }: ExtensionEvent) => {
    const current = this.permissionMap.get(extension.id)!
    return { permissions: [...current.permissions], origins: [...current.origins] }
  }

  private remove = ({ extension }: ExtensionEvent, permissions: chrome.permissions.Permissions) => {
    // TODO
    return true
  }

  private request = async (
    { extension }: ExtensionEvent,
    request: chrome.permissions.Permissions,
  ) => {
    const manifest: ManifestWithOptionalHosts = extension.manifest
    const permissions = this.permissionMap.get(extension.id)!
    const optional = splitPermissions(manifest.optional_permissions || [])
    const declaredPermissions = new Set([...permissions.permissions, ...optional.permissions])
    const declaredOrigins = [
      ...permissions.origins,
      ...(manifest.optional_host_permissions || []),
      ...optional.origins,
    ]

    if (request.permissions && !request.permissions.every((p) => declaredPermissions.has(p))) {
      throw new Error('Permissions request includes undeclared permission')
    }
    if (request.origins && !request.origins.every((o) => originCovered(declaredOrigins, o))) {
      throw new Error('Permissions request includes undeclared origin')
    }

    const missing: chrome.permissions.Permissions = {}
    const missingPermissions = (request.permissions || []).filter(
      (p) => !permissions.permissions.includes(p),
    )
    const missingOrigins = (request.origins || []).filter(
      (o) => !originCovered(permissions.origins, o),
    )
    if (missingPermissions.length) missing.permissions = missingPermissions
    if (missingOrigins.length) missing.origins = missingOrigins
    if (!missingPermissions.length && !missingOrigins.length) return true

    const granted = await this.ctx.store.requestPermissions(extension, missing)
    if (!granted) return false

    for (const origin of missingOrigins) {
      if (!permissions.origins.includes(origin)) permissions.origins.push(origin)
    }
    for (const permission of missingPermissions) {
      if (!permissions.permissions.includes(permission)) permissions.permissions.push(permission)
    }
    return true
  }
}
