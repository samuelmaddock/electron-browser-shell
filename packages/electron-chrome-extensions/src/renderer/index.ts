import { ipcRenderer, contextBridge, webFrame } from 'electron'
import { addExtensionListener, removeExtensionListener } from './event'

export const injectExtensionAPIs = () => {
  interface ExtensionMessageOptions {
    noop?: boolean
    serialize?: (...args: any[]) => any[]
  }

  const invokeExtension = async function (
    extensionId: string,
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

    let result

    try {
      result = await ipcRenderer.invoke('crx-msg', extensionId, fnName, ...args)
    } catch (e) {
      // TODO: Set chrome.runtime.lastError?
      console.error(e)
      result = undefined
    }

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
  }

  // Function body to run in the main world.
  // IMPORTANT: This must be self-contained, no closure variable will be included!
  function mainWorldScript() {
    // Use context bridge API or closure variable when context isolation is disabled.
    const electron = ((window as any).electron as typeof electronContext) || electronContext

    const chrome = window.chrome || {}
    const extensionId = chrome.runtime?.id

    // NOTE: This uses a synchronous IPC to get the extension manifest.
    // To avoid this, JS bindings for RendererExtensionRegistry would be
    // required.
    const manifest: chrome.runtime.Manifest =
      (extensionId && chrome.runtime.getManifest()) || ({} as any)

    const invokeExtension =
      (fnName: string, opts: ExtensionMessageOptions = {}) =>
      (...args: any[]) =>
        electron.invokeExtension(extensionId, fnName, opts, ...args)

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
        electron.addExtensionListener(extensionId, this.name, callback)
      }
      removeListener(callback: T) {
        electron.removeExtensionListener(extensionId, this.name, callback)
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

    class ChromeSetting implements Partial<chrome.types.ChromeSetting> {
      set() {}
      get() {}
      clear() {}
      // onChange: chrome.types.ChromeSettingChangedEvent
    }

    type DeepPartial<T> = {
      [P in keyof T]?: DeepPartial<T[P]>
    }

    type APIFactoryMap = {
      [apiName in keyof typeof chrome]: {
        shouldInject?: () => boolean
        factory: (base: DeepPartial<typeof chrome[apiName]>) => DeepPartial<typeof chrome[apiName]>
      }
    }

    /**
     * Factories for each additional chrome.* API.
     */
    const apiDefinitions: Partial<APIFactoryMap> = {
      browserAction: {
        shouldInject: () => !!manifest.browser_action,
        factory: (base) => {
          const api = {
            ...base,

            setTitle: invokeExtension('browserAction.setTitle'),
            getTitle: invokeExtension('browserAction.getTitle'),

            setIcon: invokeExtension('browserAction.setIcon', {
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

            setPopup: invokeExtension('browserAction.setPopup'),
            getPopup: invokeExtension('browserAction.getPopup'),

            setBadgeText: invokeExtension('browserAction.setBadgeText'),
            getBadgeText: invokeExtension('browserAction.getBadgeText'),

            setBadgeBackgroundColor: invokeExtension('browserAction.setBadgeBackgroundColor'),
            getBadgeBackgroundColor: invokeExtension('browserAction.getBadgeBackgroundColor'),

            enable: invokeExtension('browserAction.enable', { noop: true }),
            disable: invokeExtension('browserAction.disable', { noop: true }),

            onClicked: new ExtensionEvent('browserAction.onClicked'),
          }

          return api
        },
      },

      commands: {
        factory: (base) => {
          return {
            ...base,
            getAll: invokeExtension('commands.getAll'),
            onCommand: new ExtensionEvent('commands.onCommand'),
          }
        },
      },

      contextMenus: {
        factory: (base) => {
          let menuCounter = 0
          const menuCallbacks: {
            [key: string]: chrome.contextMenus.CreateProperties['onclick']
          } = {}
          const menuCreate = invokeExtension('contextMenus.create')

          let hasInternalListener = false
          const addInternalListener = () => {
            api.onClicked.addListener((info, tab) => {
              const callback = menuCallbacks[info.menuItemId]
              if (callback && tab) callback(info, tab)
            })
            hasInternalListener = true
          }

          const api = {
            ...base,
            create: function (
              createProperties: chrome.contextMenus.CreateProperties,
              callback?: Function
            ) {
              if (typeof createProperties.id === 'undefined') {
                createProperties.id = `${++menuCounter}`
              }
              if (createProperties.onclick) {
                if (!hasInternalListener) addInternalListener()
                menuCallbacks[createProperties.id] = createProperties.onclick
                delete createProperties.onclick
              }
              menuCreate(createProperties, callback)
              return createProperties.id
            },
            update: invokeExtension('contextMenus.update', { noop: true }),
            remove: invokeExtension('contextMenus.remove'),
            removeAll: invokeExtension('contextMenus.removeAll'),
            onClicked: new ExtensionEvent<
              (info: chrome.contextMenus.OnClickData, tab: chrome.tabs.Tab) => void
            >('contextMenus.onClicked'),
          }

          return api
        },
      },

      cookies: {
        factory: (base) => {
          return {
            ...base,
            get: invokeExtension('cookies.get'),
            getAll: invokeExtension('cookies.getAll'),
            set: invokeExtension('cookies.set'),
            remove: invokeExtension('cookies.remove'),
            getAllCookieStores: invokeExtension('cookies.getAllCookieStores'),
            onChanged: new ExtensionEvent('cookies.onChanged'),
          }
        },
      },

      extension: {
        factory: (base) => {
          return {
            ...base,
            isAllowedIncognitoAccess: () => false,
            // TODO: Add native implementation
            getViews: () => [],
          }
        },
      },

      notifications: {
        factory: (base) => {
          return {
            ...base,
            clear: invokeExtension('notifications.clear'),
            create: invokeExtension('notifications.create'),
            getAll: invokeExtension('notifications.getAll'),
            getPermissionLevel: invokeExtension('notifications.getPermissionLevel'),
            update: invokeExtension('notifications.update'),
            onClicked: new ExtensionEvent('notifications.onClicked'),
            onButtonClicked: new ExtensionEvent('notifications.onButtonClicked'),
            onClosed: new ExtensionEvent('notifications.onClosed'),
          }
        },
      },

      privacy: {
        factory: (base) => {
          return {
            ...base,
            network: {
              networkPredictionEnabled: new ChromeSetting(),
              webRTCIPHandlingPolicy: new ChromeSetting(),
            },
            websites: {
              hyperlinkAuditingEnabled: new ChromeSetting(),
            },
          }
        },
      },

      runtime: {
        factory: (base) => {
          return {
            ...base,
            openOptionsPage: invokeExtension('runtime.openOptionsPage'),
          }
        },
      },

      storage: {
        factory: (base) => {
          const local = base && base.local
          return {
            ...base,
            // TODO: provide a backend for browsers to opt-in to
            managed: local,
            sync: local,
          }
        },
      },

      tabs: {
        factory: (base) => {
          const api = {
            ...base,
            create: invokeExtension('tabs.create'),
            executeScript: function (arg1: unknown, arg2: unknown, arg3: unknown) {
              // Electron's implementation of chrome.tabs.executeScript is in
              // C++, but it doesn't support implicit execution in the active
              // tab. To handle this, we need to get the active tab ID and
              // pass it into the C++ implementation ourselves.
              if (typeof arg1 === 'object') {
                api.query(
                  { active: true, windowId: chrome.windows.WINDOW_ID_CURRENT },
                  ([activeTab]: chrome.tabs.Tab[]) => {
                    api.executeScript(activeTab.id, arg1, arg2)
                  }
                )
              } else {
                ;(base.executeScript as typeof chrome.tabs.executeScript)(
                  arg1 as number,
                  arg2 as chrome.tabs.InjectDetails,
                  arg3 as () => {}
                )
              }
            },
            get: invokeExtension('tabs.get'),
            getCurrent: invokeExtension('tabs.getCurrent'),
            getAllInWindow: invokeExtension('tabs.getAllInWindow'),
            insertCSS: invokeExtension('tabs.insertCSS'),
            query: invokeExtension('tabs.query'),
            reload: invokeExtension('tabs.reload'),
            update: invokeExtension('tabs.update'),
            remove: invokeExtension('tabs.remove'),
            goBack: invokeExtension('tabs.goBack'),
            goForward: invokeExtension('tabs.goForward'),
            onCreated: new ExtensionEvent('tabs.onCreated'),
            onRemoved: new ExtensionEvent('tabs.onRemoved'),
            onUpdated: new ExtensionEvent('tabs.onUpdated'),
            onActivated: new ExtensionEvent('tabs.onActivated'),
            onReplaced: new ExtensionEvent('tabs.onReplaced'),
          }
          return api
        },
      },

      webNavigation: {
        factory: (base) => {
          return {
            ...base,
            getFrame: invokeExtension('webNavigation.getFrame'),
            getAllFrames: invokeExtension('webNavigation.getAllFrames'),
            onBeforeNavigate: new ExtensionEvent('webNavigation.onBeforeNavigate'),
            onCommitted: new ExtensionEvent('webNavigation.onCommitted'),
            onCompleted: new ExtensionEvent('webNavigation.onCompleted'),
            onCreatedNavigationTarget: new ExtensionEvent(
              'webNavigation.onCreatedNavigationTarget'
            ),
            onDOMContentLoaded: new ExtensionEvent('webNavigation.onDOMContentLoaded'),
            onErrorOccurred: new ExtensionEvent('webNavigation.onErrorOccurred'),
            onHistoryStateUpdated: new ExtensionEvent('webNavigation.onHistoryStateUpdated'),
            onReferenceFragmentUpdated: new ExtensionEvent(
              'webNavigation.onReferenceFragmentUpdated'
            ),
            onTabReplaced: new ExtensionEvent('webNavigation.onTabReplaced'),
          }
        },
      },

      webRequest: {
        factory: (base) => {
          return {
            ...base,
            onHeadersReceived: new ExtensionEvent('webRequest.onHeadersReceived'),
          }
        },
      },

      windows: {
        factory: (base) => {
          return {
            ...base,
            WINDOW_ID_NONE: -1,
            WINDOW_ID_CURRENT: -2,
            getCurrent:invokeExtension('windows.getCurrent'),
            get: invokeExtension('windows.get'),
            getLastFocused: invokeExtension('windows.getLastFocused'),
            getAll: invokeExtension('windows.getAll'),
            create: invokeExtension('windows.create'),
            update: invokeExtension('windows.update'),
            remove: invokeExtension('windows.remove'),
            onCreated: new ExtensionEvent('windows.onCreated'),
            onRemoved: new ExtensionEvent('windows.onRemoved'),
            onFocusChanged: new ExtensionEvent('windows.onFocusChanged'),
          }
        },
      },
    }

    // Initialize APIs
    Object.keys(apiDefinitions).forEach((key: any) => {
      const apiName: keyof typeof chrome = key
      const baseApi = chrome[apiName] as any
      const api = apiDefinitions[apiName]!

      // Allow APIs to opt-out of being available in this context.
      if (api.shouldInject && !api.shouldInject()) return

      Object.defineProperty(chrome, apiName, {
        value: api.factory(baseApi),
        enumerable: true,
        configurable: true,
      })
    })

    // Remove access to internals
    delete (window as any).electron

    Object.freeze(chrome)

    void 0 // no return
  }

  try {
    // Expose extension IPC to main world
    contextBridge.exposeInMainWorld('electron', electronContext)

    // Mutate global 'chrome' object with additional APIs in the main world.
    webFrame.executeJavaScript(`(${mainWorldScript}());`)
  } catch {
    // contextBridge threw an error which means we're in the main world so we
    // can just execute our function.
    mainWorldScript()
  }
}
