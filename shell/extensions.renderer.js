// Only load within extension page context
if (!location.href.startsWith('chrome-extension://')) return

const { ipcRenderer } = require('electron')

class Event {
  constructor(name) {
    this.name = name
  }

  addListener(callback) {
    console.log(`${this.name}.addListener`)
    const self = this
    ipcRenderer.addListener(this.name, function(event, ...args) {
      console.log('GOT CALLBACK', self.name, ...arguments)
      callback(...args)
    })
  }

  removeListener(callback) {
    ipcRenderer.removeListener(this.name, callback)
  }
}

const TODO_NOOP = true

const extMessage = (fnName, noop) =>
  async function() {
    const args = [...arguments]
    const callback =
      typeof args[args.length - 1] === 'function' ? args.pop() : undefined
    console.log(fnName, args)

    if (noop) {
      if (callback) callback()
      return
    }

    const result = await ipcRenderer.invoke(fnName, ...args)
    console.log(fnName, '(result)', result)
    if (callback) {
      callback(result)
    } else {
      return result
    }
  }

const webNavigation = {
  onBeforeNavigate: new Event('webNavigation.onBeforeNavigate'),
  onCompleted: new Event('webNavigation.onCompleted'),
  onCreatedNavigationTarget: new Event(
    'webNavigation.onCreatedNavigationTarget'
  ),
  onCommitted: new Event('webNavigation.onCommitted')
}

const browserAction = {
  setBadgeBackgroundColor: extMessage('browserAction.setBadgeBackgroundColor'),
  setBadgeText: extMessage('browserAction.setBadgeText'),
  // TODO: serialize ImageDataType
  // https://developer.chrome.com/extensions/browserAction#method-setIcon
  setIcon: extMessage('browserAction.setIcon', TODO_NOOP),
  setTitle: extMessage('browserAction.setTitle'),
  onClicked: new Event('browserAction.onClicked')
}

const contextMenus = {
  create: extMessage('contextMenus.create', TODO_NOOP),
  remove: extMessage('contextMenus.remove', TODO_NOOP),
  onClicked: new Event('contextMenus.onClicked')
}

const tabs = {
  ...chrome.tabs,
  create: extMessage('tabs.create'),
  get: extMessage('tabs.get'),
  getAllInWindow: extMessage('tabs.getAllInWindow'),
  insertCSS: extMessage('tabs.insertCSS'),
  query: extMessage('tabs.query'),
  reload: extMessage('tabs.reload'),
  update: extMessage('tabs.update'),
  onCreated: new Event('tabs.onCreated'),
  onRemoved: new Event('tabs.onRemoved'),
  onUpdated: new Event('tabs.onUpdated'),
  onActivated: new Event('tabs.onActivated')
}

const webRequest = {
  ...(chrome.webRequest || {}),
  onHeadersReceived: new Event('webRequest.onHeadersReceived')
}

const windows = {
  ...(chrome.windows || {}),
  get: extMessage('windows.get'),
  create: extMessage('windows.create'),
  update: extMessage('windows.update'),
  onFocusChanged: new Event('windows.onFocusChanged')
}

class PolicyConfig {
  get() {}
  set() {}
  clear() {}
}

const privacy = {
  network: {
    networkPredictionEnabled: new PolicyConfig(),
    webRTCIPHandlingPolicy: new PolicyConfig()
  },
  websites: {
    hyperlinkAuditingEnabled: new PolicyConfig()
  }
}

Object.assign(chrome, {
  browserAction,
  contextMenus,
  privacy,
  tabs,
  webNavigation,
  webRequest,
  windows
})
