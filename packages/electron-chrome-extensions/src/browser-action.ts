import { ipcRenderer, contextBridge, webFrame } from 'electron'

/**
 * Injects `<browser-action>` custom element into the current webpage.
 */
export const injectBrowserAction = () => {
  const actionMap = new Map<string, any>()
  const observerCounts = new Map<string, number>()

  // Reuse `process` to avoid bundling custom EventEmitter
  const internalEmitter = process as NodeJS.EventEmitter

  const invoke = <T>(name: string, partition: string, ...args: any[]): Promise<T> => {
    return ipcRenderer.invoke('crx-msg-remote', partition, name, ...args)
  }

  interface ActivateDetails {
    eventType: string
    extensionId: string
    tabId: number
    anchorRect: { x: number; y: number; width: number; height: number }
    alignment?: string
    offset?: string
  }

  const __browserAction__ = {
    addEventListener(name: string, listener: (...args: any[]) => void) {
      internalEmitter.addListener(`-actions-${name}`, listener)
    },
    removeEventListener(name: string, listener: (...args: any[]) => void) {
      internalEmitter.removeListener(`-actions-${name}`, listener)
    },

    getAction(extensionId: string) {
      return actionMap.get(extensionId)
    },
    async getState(partition: string): Promise<{ activeTabId?: number; actions: any[] }> {
      const state = await invoke<any>('browserAction.getState', partition)
      for (const action of state.actions) {
        actionMap.set(action.id, action)
      }
      queueMicrotask(() => internalEmitter.emit('-actions-update', state))
      return state
    },

    activate: (partition: string, details: ActivateDetails) => {
      return invoke('browserAction.activate', partition, details)
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
        observerCounts.delete(partition)
      }
    },
  }

  ipcRenderer.on('browserAction.update', () => {
    for (const partition of observerCounts.keys()) {
      __browserAction__.getState(partition)
    }
  })

  // Function body to run in the main world.
  // IMPORTANT: This must be self-contained, no closure variables can be used!
  function mainWorldScript() {
    const DEFAULT_PARTITION = '_self'

    // Access from globalThis to prevent accessing incorrect minified variable.
    // Fallback to `__browserAction__` when context isolation is disabled.
    const browserAction: typeof __browserAction__ =
      (globalThis as any).browserAction || __browserAction__

    class BrowserActionElement extends HTMLButtonElement {
      private updateId?: number
      private badge?: HTMLDivElement
      private pendingIcon?: HTMLImageElement

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

      get alignment(): string {
        return this.getAttribute('alignment') || ''
      }

      set alignment(alignment: string) {
        this.setAttribute('alignment', alignment)
      }

      get offset(): string {
        return this.getAttribute('offset') || ''
      }

      set offset(offset: string) {
        this.setAttribute('offset', offset)
      }

      static get observedAttributes() {
        return ['id', 'tab', 'partition', 'alignment', 'offset']
      }

      constructor() {
        super()

        // TODO: event delegation
        this.addEventListener('click', this.onClick.bind(this))
        this.addEventListener('contextmenu', this.onContextMenu.bind(this))
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
        if (this.pendingIcon) {
          this.pendingIcon = undefined
        }
      }

      attributeChangedCallback() {
        if (this.isConnected) {
          this.update()
        }
      }

      private activate(event: Event) {
        const rect = this.getBoundingClientRect()

        browserAction.activate(this.partition || DEFAULT_PARTITION, {
          eventType: event.type,
          extensionId: this.id,
          tabId: this.tab,
          alignment: this.alignment,
          offset: this.offset,
          anchorRect: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          },
        })
      }

      private onClick(event: MouseEvent) {
        this.activate(event)
      }

      private onContextMenu(event: MouseEvent) {
        event.stopImmediatePropagation()
        event.preventDefault()

        this.activate(event)
      }

      private getBadge() {
        let badge = this.badge
        if (!badge) {
          this.badge = badge = document.createElement('div')
          badge.className = 'badge'
          ;(badge as any).part = 'badge'
          this.appendChild(badge)
        }
        return badge
      }

      private update() {
        if (this.updateId) return
        this.updateId = requestAnimationFrame(this.updateCallback.bind(this))
      }

      private updateIcon(info: any) {
        const iconSize = 32
        const resizeType = 2
        const searchParams = new URLSearchParams({
          tabId: `${this.tab}`,
          partition: `${this.partition || DEFAULT_PARTITION}`,
        })
        if (info.iconModified) {
          searchParams.append('t', info.iconModified)
        }
        const iconUrl = `crx://extension-icon/${this.id}/${iconSize}/${resizeType}?${searchParams.toString()}`
        const bgImage = `url(${iconUrl})`

        if (this.pendingIcon) {
          this.pendingIcon.onload = this.pendingIcon.onerror = () => {}
          this.pendingIcon = undefined
        }

        // Preload icon to prevent it from blinking
        const img = (this.pendingIcon = new Image())
        img.onerror = () => {
          if (this.isConnected) {
            this.classList.toggle('no-icon', true)
            if (this.title) {
              this.dataset.letter = this.title.charAt(0)
            }
            this.pendingIcon = undefined
          }
        }
        img.onload = () => {
          if (this.isConnected) {
            this.classList.toggle('no-icon', false)
            this.style.backgroundImage = bgImage
            this.pendingIcon = undefined
          }
        }
        img.src = iconUrl
      }

      private updateCallback() {
        this.updateId = undefined

        const action = browserAction.getAction(this.id)

        const activeTabId = this.tab
        const tabInfo = activeTabId > -1 ? action.tabs[activeTabId] : {}
        const info = { ...tabInfo, ...action }

        this.title = typeof info.title === 'string' ? info.title : ''

        this.updateIcon(info)

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

      get alignment(): string {
        return this.getAttribute('alignment') || ''
      }

      set alignment(alignment: string) {
        this.setAttribute('alignment', alignment)
      }

      get offset(): string {
        return this.getAttribute('offset') || ''
      }

      set offset(offset: string) {
        this.setAttribute('offset', offset)
      }

      static get observedAttributes() {
        return ['tab', 'partition', 'alignment', 'offset']
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
}

.action {
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

.action:hover {
  background-color: var(--browser-action-hover-bg, rgba(255, 255, 255, 0.3));
}

.action.no-icon::after {
  content: attr(data-letter);
  text-transform: uppercase;
  font-size: .7rem;
  background-color: #757575;
  color: white;
  border-radius: 4px;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 80%;
  height: 80%;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
}

.badge {
  box-shadow: 0px 0px 1px 1px var(--browser-action-badge-outline, #444);
  box-sizing: border-box;
  max-width: 100%;
  height: 12px;
  padding: 0 2px;
  border-radius: 2px;
  position: absolute;
  bottom: 1px;
  right: 0;
  pointer-events: none;
  line-height: 1.5;
  font-size: 9px;
  font-weight: 400;
  overflow: hidden;
  white-space: nowrap;
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
            `browser-action-list failed to update [tab: ${this.tab}, partition: '${this.partition}']`,
          )
        }
      }

      private update = (state: any) => {
        const tabId =
          typeof this.tab === 'number' && this.tab >= 0 ? this.tab : state.activeTabId || -1

        // Create or update action buttons
        for (const action of state.actions) {
          let browserActionNode = this.shadowRoot?.querySelector(
            `[id=${action.id}]`,
          ) as BrowserActionElement

          if (!browserActionNode) {
            const node = document.createElement('button', {
              is: 'browser-action',
            }) as BrowserActionElement
            node.id = action.id
            node.className = 'action'
            ;(node as any).alignment = this.alignment
            ;(node as any).part = 'action'
            browserActionNode = node
            this.shadowRoot?.appendChild(browserActionNode)
          }

          if (this.partition) browserActionNode.partition = this.partition
          if (this.alignment) browserActionNode.alignment = this.alignment
          if (this.offset) browserActionNode.offset = this.offset
          browserActionNode.tab = tabId
        }

        // Remove any actions no longer in use
        const actionNodes = Array.from(
          this.shadowRoot?.querySelectorAll('.action') as any,
        ) as BrowserActionElement[]
        for (const actionNode of actionNodes) {
          if (!state.actions.some((action: any) => action.id === actionNode.id)) {
            actionNode.remove()
          }
        }
      }
    }

    customElements.define('browser-action-list', BrowserActionListElement)
  }

  if (process.contextIsolated) {
    contextBridge.exposeInMainWorld('browserAction', __browserAction__)

    // Must execute script in main world to modify custom component registry.
    if ('executeInMainWorld' in contextBridge) {
      contextBridge.executeInMainWorld({
        func: mainWorldScript,
      })
    } else {
      // Deprecated electron@<35
      webFrame.executeJavaScript(`(${mainWorldScript}());`)
    }
  } else {
    // When contextIsolation is disabled, contextBridge will throw an error.
    // If that's the case, we're in the main world so we can just execute our
    // function.
    mainWorldScript()
  }
}
