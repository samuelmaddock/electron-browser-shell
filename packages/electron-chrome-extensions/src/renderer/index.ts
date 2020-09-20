import { ipcRenderer, contextBridge, webFrame } from 'electron'
import { addExtensionListener, removeExtensionListener } from './event'

export const injectExtensionAPIs = () => {
  interface ExtensionMessageOptions {
    noop?: boolean
    serialize?: (...args: any[]) => any[]
    extensionId?: string
  }

  const invokeExtension = async function (
    fnName: string,
    options: ExtensionMessageOptions = {},
    ...args: any[]
  ) {
    const callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined

    if (process.env.NODE_ENV === 'development') {
      console.log(fnName, args)
    }

    if (options.noop) {
      console.warn(`${fnName} is not yet implemented.`)
      if (callback) callback()
      return
    }

    if (options.serialize) {
      args = options.serialize(...args)
    }

    // Include extensionId in payload
    if (options.extensionId) {
      args.splice(0, 0, options.extensionId)
    }

    const result = await ipcRenderer.invoke(fnName, ...args)

    if (process.env.NODE_ENV === 'development') {
      console.log(fnName, '(result)', result)
    }

    if (callback) {
      callback(result)
    } else {
      return result
    }
  }

  const electronContext = {
    invokeExtension,
    addExtensionListener,
    removeExtensionListener,
    ipcRenderer,
  }

  // Function body to run in the main world.
  // IMPORTANT: This must be self-contained, no closure variable will be included!
  function mainWorldScript() {
    const electron = ((window as any).electron as typeof electronContext) || electronContext

    const invokeExtension = (fnName: string, opts: ExtensionMessageOptions = {}) => (
      ...args: any[]
    ) => electron.invokeExtension(fnName, opts, ...args)

    function imageData2base64(imageData: ImageData) {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      canvas.width = imageData.width
      canvas.height = imageData.height
      ctx.putImageData(imageData, 0, 0)

      return canvas.toDataURL()
    }

    class ExtensionEvent<T extends Function> implements chrome.events.Event<T> {
      constructor(private name: string) {}
      addListener(callback: T) {
        electron.addExtensionListener(this.name, callback)
      }
      removeListener(callback: T) {
        electron.removeExtensionListener(this.name, callback)
      }

      getRules(callback: (rules: chrome.events.Rule[]) => void): void
      getRules(ruleIdentifiers: string[], callback: (rules: chrome.events.Rule[]) => void): void
      getRules(ruleIdentifiers: any, callback?: any) {
        throw new Error('Method not implemented.')
      }
      hasListener(callback: T): boolean {
        throw new Error('Method not implemented.')
      }
      removeRules(ruleIdentifiers?: string[] | undefined, callback?: (() => void) | undefined): void
      removeRules(callback?: (() => void) | undefined): void
      removeRules(ruleIdentifiers?: any, callback?: any) {
        throw new Error('Method not implemented.')
      }
      addRules(
        rules: chrome.events.Rule[],
        callback?: ((rules: chrome.events.Rule[]) => void) | undefined
      ): void {
        throw new Error('Method not implemented.')
      }
      hasListeners(): boolean {
        throw new Error('Method not implemented.')
      }
    }

    const chrome = window.chrome || {}
    const extensionId = chrome.runtime?.id
    const manifest: chrome.runtime.Manifest =
      (extensionId && chrome.runtime.getManifest()) || ({} as any)

    const webNavigation = {
      ...chrome.webNavigation,
      getFrame: invokeExtension('webNavigation.getFrame'),
      onBeforeNavigate: new ExtensionEvent('webNavigation.onBeforeNavigate'),
      onCompleted: new ExtensionEvent('webNavigation.onCompleted'),
      onCreatedNavigationTarget: new ExtensionEvent('webNavigation.onCreatedNavigationTarget'),
      onCommitted: new ExtensionEvent('webNavigation.onCommitted'),
      onHistoryStateUpdated: new ExtensionEvent('webNavigation.onHistoryStateUpdated'),
    }

    const browserAction: Partial<typeof chrome.browserAction> = {
      setTitle: invokeExtension('browserAction.setTitle', { extensionId }),
      getTitle: invokeExtension('browserAction.getTitle', { extensionId, noop: true }),

      setIcon: invokeExtension('browserAction.setIcon', {
        extensionId,
        serialize: (details: any) => {
          if (details.imageData) {
            if (details.imageData instanceof ImageData) {
              details.imageData = imageData2base64(details.imageData)
            } else {
              details.imageData = Object.entries(details.imageData).reduce(
                (obj: any, pair: any[]) => {
                  obj[pair[0]] = imageData2base64(pair[1])
                  return obj
                },
                {}
              )
            }
          }

          return [details]
        },
      }),

      setPopup: invokeExtension('browserAction.setPopup', { extensionId }),
      getPopup: invokeExtension('browserAction.getPopup', { extensionId, noop: true }),

      setBadgeText: invokeExtension('browserAction.setBadgeText', { extensionId }),
      getBadgeText: invokeExtension('browserAction.getBadgeText', { extensionId, noop: true }),

      setBadgeBackgroundColor: invokeExtension('browserAction.setBadgeBackgroundColor', {
        extensionId,
      }),
      getBadgeBackgroundColor: invokeExtension('browserAction.getBadgeBackgroundColor', {
        extensionId,
        noop: true,
      }),

      enable: invokeExtension('browserAction.enable', { extensionId, noop: true }),
      disable: invokeExtension('browserAction.disable', { extensionId, noop: true }),

      onClicked: new ExtensionEvent('browserAction.onClicked'),
    }

    // TODO: only created these in special webui context
    Object.assign(browserAction, {
      getAll: invokeExtension('browserAction.getAll', { extensionId }),
    })

    let menuCounter = 0
    const menuCallbacks: { [key: string]: chrome.contextMenus.CreateProperties['onclick'] } = {}
    const menuCreate = invokeExtension('contextMenus.create', { extensionId })

    const contextMenus: Partial<typeof chrome.contextMenus> = {
      ...chrome.contextMenus,
      create: function (
        createProperties: chrome.contextMenus.CreateProperties,
        callback?: Function
      ) {
        if (typeof createProperties.id === 'undefined') {
          createProperties.id = `${++menuCounter}`
        }
        if (createProperties.onclick) {
          menuCallbacks[createProperties.id] = createProperties.onclick
          delete createProperties.onclick
        }
        menuCreate(createProperties, callback)
        return createProperties.id
      },
      update: invokeExtension('contextMenus.update', { noop: true }),
      remove: invokeExtension('contextMenus.remove', { extensionId }),
      removeAll: invokeExtension('contextMenus.removeAll', { extensionId }),
      onClicked: new ExtensionEvent('contextMenus.onClicked'),
    }

    contextMenus.onClicked?.addListener((info, tab) => {
      // TODO: test this
      const callback = menuCallbacks[info.menuItemId]
      if (callback && tab) callback(info, tab)
    })

    const tabs: Partial<typeof chrome.tabs> = {
      ...chrome.tabs,
      create: invokeExtension('tabs.create'),
      get: invokeExtension('tabs.get'),
      getAllInWindow: invokeExtension('tabs.getAllInWindow'),
      insertCSS: invokeExtension('tabs.insertCSS'),
      query: invokeExtension('tabs.query'),
      reload: invokeExtension('tabs.reload'),
      update: invokeExtension('tabs.update'),
      remove: invokeExtension('tabs.remove'),
      onCreated: new ExtensionEvent('tabs.onCreated'),
      onRemoved: new ExtensionEvent('tabs.onRemoved'),
      onUpdated: new ExtensionEvent('tabs.onUpdated'),
      onActivated: new ExtensionEvent('tabs.onActivated'),
    }

    const webRequest: Partial<typeof chrome.webRequest> = {
      ...chrome.webRequest,
      onHeadersReceived: new ExtensionEvent('webRequest.onHeadersReceived'),
    }

    const windows: Partial<typeof chrome.windows> = {
      ...chrome.windows,
      WINDOW_ID_NONE: -1,
      WINDOW_ID_CURRENT: -2,
      get: invokeExtension('windows.get'),
      create: invokeExtension('windows.create'),
      update: invokeExtension('windows.update'),
      onFocusChanged: new ExtensionEvent('windows.onFocusChanged'),
    }

    class ChromeSetting implements Partial<chrome.types.ChromeSetting> {
      set() {}
      get() {}
      clear() {}
      // onChange: chrome.types.ChromeSettingChangedEvent
    }

    const privacy = {
      network: {
        networkPredictionEnabled: new ChromeSetting(),
        webRTCIPHandlingPolicy: new ChromeSetting(),
      },
      websites: {
        hyperlinkAuditingEnabled: new ChromeSetting(),
      },
    }

    Object.assign(chrome, {
      contextMenus,
      privacy,
      tabs,
      webNavigation,
      webRequest,
      windows,
    })

    if (manifest.browser_action) {
      Object.assign(chrome, { browserAction })
    }

    // TODO: need to only optionally include this
    ;(chrome as any).ipcRenderer = electron.ipcRenderer

    // Remove access to internals
    delete (window as any).electron
  }

  try {
    // Expose extension IPC to main world
    contextBridge.exposeInMainWorld('electron', electronContext)

    // Mutate global 'chrome' object with additional APIs in the main world
    webFrame.executeJavaScript(`(${mainWorldScript}());`)
  } catch {
    mainWorldScript()
  }
}
