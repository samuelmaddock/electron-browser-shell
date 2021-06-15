import { app, Extension, Notification } from 'electron'
import { ExtensionContext } from '../context'
import { ExtensionEvent } from '../router'
import { validateExtensionResource } from './common'

enum TemplateType {
  Basic = 'basic',
  Image = 'image',
  List = 'list',
  Progress = 'progress',
}

const getBody = (opts: chrome.notifications.NotificationOptions) => {
  const { type = TemplateType.Basic } = opts

  switch (type) {
    case TemplateType.List: {
      if (!Array.isArray(opts.items)) {
        throw new Error('List items must be provided for list type')
      }
      return opts.items.map((item) => `${item.title} - ${item.message}`).join('\n')
    }
    default:
      return opts.message || ''
  }
}

const getUrgency = (
  priority?: number
): Required<Electron.NotificationConstructorOptions>['urgency'] => {
  if (typeof priority !== 'number') {
    return 'normal'
  } else if (priority >= 2) {
    return 'critical'
  } else if (priority < 0) {
    return 'low'
  } else {
    return 'normal'
  }
}

const createScopedIdentifier = (extension: Extension, id: string) => `${extension.id}-${id}`
const stripScopeFromIdentifier = (id: string) => {
  const index = id.indexOf('-')
  return id.substr(index + 1)
}

export class NotificationsAPI {
  private registry = new Map<string, Notification>()

  constructor(private ctx: ExtensionContext) {
    const handle = this.ctx.router.apiHandler()
    handle('notifications.clear', this.clear)
    handle('notifications.create', this.create)
    handle('notifications.getAll', this.getAll)
    handle('notifications.getPermissionLevel', this.getPermissionLevel)
    handle('notifications.update', this.update)

    this.ctx.session.on('extension-unloaded', (event, extension) => {
      for (const [key, notification] of this.registry) {
        if (key.startsWith(extension.id)) {
          notification.close()
        }
      }
    })
  }

  private clear = ({ extension }: ExtensionEvent, id: string) => {
    const notificationId = createScopedIdentifier(extension, id)
    if (this.registry.has(notificationId)) {
      this.registry.get(notificationId)?.close()
    }
  }

  private create = async ({ extension }: ExtensionEvent, arg1: unknown, arg2?: unknown) => {
    let id: string
    let opts: chrome.notifications.NotificationOptions

    if (typeof arg1 === 'object') {
      id = 'guid' // TODO: generate uuid
      opts = arg1 as chrome.notifications.NotificationOptions
    } else if (typeof arg1 === 'string') {
      id = arg1
      opts = arg2 as chrome.notifications.NotificationOptions
    } else {
      throw new Error('Invalid arguments')
    }

    if (typeof opts !== 'object' || !opts.type || !opts.iconUrl || !opts.title || !opts.message) {
      throw new Error('Missing required notification options')
    }

    const notificationId = createScopedIdentifier(extension, id)

    if (this.registry.has(notificationId)) {
      this.registry.get(notificationId)?.close()
    }

    let icon

    if (opts.iconUrl) {
      let url
      try {
        url = new URL(opts.iconUrl)
      } catch {}

      if (url?.protocol === 'data:') {
        icon = opts.iconUrl
      } else {
        icon = await validateExtensionResource(extension, opts.iconUrl)
      }

      if (!icon) {
        throw new Error('Invalid iconUrl')
      }
    }

    // TODO: buttons, template types

    const notification = new Notification({
      title: opts.title,
      subtitle: app.name,
      body: getBody(opts),
      silent: opts.silent,
      icon,
      urgency: getUrgency(opts.priority),
      timeoutType: opts.requireInteraction ? 'never' : 'default',
    })

    this.registry.set(notificationId, notification)

    notification.on('click', () => {
      this.ctx.router.sendEvent(extension.id, 'notifications.onClicked', id)
    })

    notification.once('close', () => {
      const byUser = true // TODO
      this.ctx.router.sendEvent(extension.id, 'notifications.onClosed', id, byUser)
      this.registry.delete(notificationId)
    })

    notification.show()

    return id
  }

  private getAll = ({ extension }: ExtensionEvent) => {
    return Array.from(this.registry.keys())
      .filter((key) => key.startsWith(extension.id))
      .map(stripScopeFromIdentifier)
  }

  private getPermissionLevel = (event: ExtensionEvent) => {
    return Notification.isSupported() ? 'granted' : 'denied'
  }

  private update = (
    { extension }: ExtensionEvent,
    id: string,
    opts: chrome.notifications.NotificationOptions
  ) => {
    const notificationId = createScopedIdentifier(extension, id)

    const notification = this.registry.get(notificationId)

    if (!notification) {
      return false
    }

    // TODO: remaining opts

    if (opts.priority) notification.urgency = getUrgency(opts.priority)
    if (opts.silent) notification.silent = opts.silent
  }
}
