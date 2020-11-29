import { ipcRenderer, contextBridge, webFrame } from 'electron'
import { EventEmitter } from 'events'

export const injectBrowserAction = () => {
  const actionMap = new Map<string, any>()
  const internalEmitter = new EventEmitter()

  const invoke = <T>(name: string, ...args: any[]): Promise<T> => {
    return ipcRenderer.invoke('CHROME_EXT', name, ...args)
  }

  const browserActionImpl = {
    addEventListener(name: string, listener: (...args: any[]) => void) {
      internalEmitter.addListener(name, listener)
    },
    removeEventListener(name: string, listener: (...args: any[]) => void) {
      internalEmitter.removeListener(name, listener)
    },

    getAction(extensionId: string, partition: string = '') {
      return actionMap.get(extensionId)
    },
    async getAll(): Promise<any> {
      const actions = await invoke<any[]>('browserAction.getAll')
      for (const action of actions) {
        actionMap.set(action.id, action)
      }
      queueMicrotask(() => internalEmitter.emit('update'))
      return actions
    },

    activate: (extensionId: string) => {
      invoke('browserAction.activate', extensionId)
    },
  }

  invoke('browserAction.addObserver')

  ipcRenderer.on('browserAction.update', () => {
    browserActionImpl.getAll()
  })

  // Function body to run in the main world.
  // IMPORTANT: This must be self-contained, no closure variables can be used!
  function mainWorldScript() {
    const browserAction = (window as any).browserAction as typeof browserActionImpl

    class BrowserActionElement extends HTMLButtonElement {
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

      static get observedAttributes() {
        return ['id', 'tab']
      }

      constructor() {
        super()

        this.addEventListener('click', this.onClick.bind(this))

        browserAction.addEventListener('update', this.update.bind(this))

        const style = document.createElement('style')
        style.textContent = `
button {
  width: 24px;
  height: 24px;
  background-color: transparent;
  background-position: center;
  background-repeat: no-repeat;
  background-size: 80%;
  border: none;
  padding: 0;
  position: relative;
}

.badge {
  box-sizing: border-box;
  max-width: 100%;
  height: 12px;
  padding: 0 4px;
  border-radius: 2px;
  position: absolute;
  bottom: 0;
  right: 0;
  pointer-events: none;
  line-height: 1.2;
  font-size: 10px;
  font-weight: 600;
  overflow: hidden;
  white-space: nowrap;
}`
        this.appendChild(style)
      }

      attributeChangedCallback() {
        this.update()
      }

      private onClick() {
        browserAction.activate(this.id)
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
        }
      }
    }

    customElements.define('browser-action', BrowserActionElement, { extends: 'button' })

    class BrowserActionListElement extends HTMLElement {
      get tab(): number {
        const tabId = parseInt(this.getAttribute('tab') || '', 10)
        return typeof tabId === 'number' && !isNaN(tabId) ? tabId : -1
      }

      set tab(tab: number) {
        this.setAttribute('tab', `${tab}`)
      }

      get partition(): string {
        return this.getAttribute('partition') || ''
      }

      set partition(partition: string) {
        this.setAttribute('partition', partition)
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

        this.update()
      }

      attributeChangedCallback() {
        this.update()
      }

      private async update() {
        // TODO: filter with `partition` attribute
        const actions = await browserAction.getAll()
        const activeTabId = this.tab

        for (const action of actions) {
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
          browserActionNode.tab = activeTabId
        }
      }
    }

    customElements.define('browser-action-list', BrowserActionListElement)
  }

  try {
    contextBridge.exposeInMainWorld('browserAction', browserActionImpl)

    // Mutate global 'chrome' object with additional APIs in the main world
    webFrame.executeJavaScript(`(${mainWorldScript}());`)
  } catch {
    // contextBridge threw an error which means we're in the main world so we
    // can just execute our function.
    mainWorldScript()
  }
}
