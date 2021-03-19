import { ipcRenderer, contextBridge, webFrame } from 'electron'
import { EventEmitter } from 'events'

export const injectBrowserAction = () => {
  const actionMap = new Map<string, any>()
  const internalEmitter = new EventEmitter()
  const observerCounts = new Map<string, number>()

  const invoke = <T>(name: string, partition: string, ...args: any[]): Promise<T> => {
    return ipcRenderer.invoke('CHROME_EXT_REMOTE', partition, name, ...args)
  }

  const browserAction = {
    addEventListener(name: string, listener: (...args: any[]) => void) {
      internalEmitter.addListener(name, listener)
    },
    removeEventListener(name: string, listener: (...args: any[]) => void) {
      internalEmitter.removeListener(name, listener)
    },

    getAction(extensionId: string) {
      return actionMap.get(extensionId)
    },
    async getState(partition: string): Promise<{ activeTabId?: number; actions: any[] }> {
      const state = await invoke<any>('browserAction.getState', partition)
      for (const action of state.actions) {
        actionMap.set(action.id, action)
      }
      queueMicrotask(() => internalEmitter.emit('update', state))
      return state
    },

    activate: (
      partition: string,
      extensionId: string,
      tabId: number,
      boundingRect: { x: number; y: number; width: number; height: number }
    ) => {
      invoke('browserAction.activate', partition, extensionId, tabId, boundingRect)
    },

    addObserver(partition: string) {
      let count = observerCounts.has(partition) ? observerCounts.get(partition)! : 0
      count = count + 1
      observerCounts.set(partition, count)

      if (count === 1) {
        invoke('browserAction.addObserver', partition)
      }
    },
    removeObserver(partition: string) {
      let count = observerCounts.has(partition) ? observerCounts.get(partition)! : 0
      count = Math.max(count - 1, 0)
      observerCounts.set(partition, count)

      if (count === 0) {
        invoke('browserAction.removeObserver', partition)
      }
    },
  }

  ipcRenderer.on('browserAction.update', () => {
    for (const partition of observerCounts.keys()) {
      browserAction.getState(partition)
    }
  })

  // Function body to run in the main world.
  // IMPORTANT: This must be self-contained, no closure variables can be used!
  function mainWorldScript() {
    const DEFAULT_PARTITION = '_self'

    class BrowserActionElement extends HTMLButtonElement {
      private updateId?: number
      private badge?: HTMLDivElement

      get id(): string {
        return this.getAttribute('id') || ''
      }

      set id(id: string) {
        this.setAttribute('id', id)
      }

      get tab(): number {
        const tabId = parseInt(this.getAttribute('tab') || '', 10)
        return typeof tabId === 'number' && !isNaN(tabId) ? tabId : -1
      }

      set tab(tab: number) {
        this.setAttribute('tab', `${tab}`)
      }

      get partition(): string | null {
        return this.getAttribute('partition')
      }

      set partition(partition: string | null) {
        if (partition) {
          this.setAttribute('partition', partition)
        } else {
          this.removeAttribute('partition')
        }
      }

      static get observedAttributes() {
        return ['id', 'tab', 'partition']
      }

      constructor() {
        super()

        this.addEventListener('click', this.onClick.bind(this))

        const style = document.createElement('style')
        style.textContent = `
button {
  width: 28px;
  height: 28px;
  background-color: transparent;
  background-position: center;
  background-repeat: no-repeat;
  background-size: 70%;
  border: none;
  border-radius: 4px;
  padding: 0;
  position: relative;
  outline: none;
}

button:hover {
  background-color: rgba(255, 255, 255, 0.3);
}

.badge {
  box-sizing: border-box;
  height: 12px;
  padding: 0 2px;
  border-radius: 2px;
  position: absolute;
  bottom: 0;
  right: 0;
  pointer-events: none;
  line-height: 1.2;
  font-size: 10px;
  font-weight: 400;
  overflow: hidden;
  white-space: nowrap;
}`
        this.appendChild(style)
      }

      connectedCallback() {
        if (this.isConnected) {
          this.update()
        }
      }

      disconnectedCallback() {
        if (this.updateId) {
          cancelAnimationFrame(this.updateId)
          this.updateId = undefined
        }
      }

      attributeChangedCallback() {
        if (this.isConnected) {
          this.update()
        }
      }

      private onClick() {
        const rect = this.getBoundingClientRect()

        browserAction.activate(this.partition || DEFAULT_PARTITION, this.id, this.tab, {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        })
      }

      private getBadge() {
        let badge = this.badge
        if (!badge) {
          this.badge = badge = document.createElement('div')
          badge.className = 'badge'
          this.appendChild(badge)
        }
        return badge
      }

      private update() {
        if (this.updateId) return
        this.updateId = requestAnimationFrame(this.updateCallback.bind(this))
      }

      private updateCallback() {
        this.updateId = undefined

        const action = browserAction.getAction(this.id)

        const activeTabId = this.tab
        const tabInfo = activeTabId > -1 ? action.tabs[activeTabId] : {}
        const info = { ...tabInfo, ...action }

        this.title = typeof info.title === 'string' ? info.title : ''

        if (info.imageData) {
          this.style.backgroundImage = info.imageData ? `url(${info.imageData['32']})` : ''
        } else if (info.icon) {
          this.style.backgroundImage = `url(${info.icon})`
        }

        if (info.text) {
          const badge = this.getBadge()
          badge.textContent = info.text
          badge.style.color = '#fff' // TODO: determine bg lightness?
          badge.style.backgroundColor = info.color
        } else if (this.badge) {
          this.badge.remove()
          this.badge = undefined
        }
      }
    }

    customElements.define('browser-action', BrowserActionElement, { extends: 'button' })

    class BrowserActionListElement extends HTMLElement {
      private observing: boolean = false

      get tab(): number | null {
        const tabId = parseInt(this.getAttribute('tab') || '', 10)
        return typeof tabId === 'number' && !isNaN(tabId) ? tabId : null
      }

      set tab(tab: number | null) {
        if (typeof tab === 'number') {
          this.setAttribute('tab', `${tab}`)
        } else {
          this.removeAttribute('tab')
        }
      }

      get partition(): string | null {
        return this.getAttribute('partition')
      }

      set partition(partition: string | null) {
        if (partition) {
          this.setAttribute('partition', partition)
        } else {
          this.removeAttribute('partition')
        }
      }

      static get observedAttributes() {
        return ['tab', 'partition']
      }

      constructor() {
        super()

        const shadowRoot = this.attachShadow({ mode: 'open' })

        const style = document.createElement('style')
        style.textContent = `
:host {
  display: flex;
  flex-direction: row;
  gap: 5px;
}`
        shadowRoot.appendChild(style)
      }

      connectedCallback() {
        if (this.isConnected) {
          this.startObserving()
          this.fetchState()
        }
      }

      disconnectedCallback() {
        this.stopObserving()
      }

      attributeChangedCallback(name: string, oldValue: any, newValue: any) {
        if (oldValue === newValue) return

        if (this.isConnected) {
          this.fetchState()
        }
      }

      private startObserving() {
        if (this.observing) return
        browserAction.addEventListener('update', this.update)
        browserAction.addObserver(this.partition || DEFAULT_PARTITION)
        this.observing = true
      }

      private stopObserving() {
        if (!this.observing) return
        browserAction.removeEventListener('update', this.update)
        browserAction.removeObserver(this.partition || DEFAULT_PARTITION)
        this.observing = false
      }

      private fetchState = async () => {
        try {
          await browserAction.getState(this.partition || DEFAULT_PARTITION)
        } catch {
          console.error(
            `browser-action-list failed to update [tab: ${this.tab}, partition: '${this.partition}']`
          )
        }
      }

      private update = (state: any) => {
        const tabId =
          typeof this.tab === 'number' && this.tab >= 0 ? this.tab : state.activeTabId || -1

        for (const action of state.actions) {
          let browserActionNode = this.shadowRoot?.querySelector(
            `[id=${action.id}]`
          ) as BrowserActionElement

          if (!browserActionNode) {
            const node = document.createElement('button', {
              is: 'browser-action',
            }) as BrowserActionElement
            node.id = action.id
            browserActionNode = node
            this.shadowRoot?.appendChild(browserActionNode)
          }

          if (this.partition) browserActionNode.partition = this.partition
          browserActionNode.tab = tabId
        }
      }
    }

    customElements.define('browser-action-list', BrowserActionListElement)
  }

  try {
    contextBridge.exposeInMainWorld('browserAction', browserAction)

    // Must execute script in main world to modify custom component registry.
    webFrame.executeJavaScript(`(${mainWorldScript}());`)
  } catch {
    // When contextIsolation is disabled, contextBridge will throw an error.
    // If that's the case, we're in the main world so we can just execute our
    // function.
    mainWorldScript()
  }
}
