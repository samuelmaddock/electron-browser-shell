// Only load within extension page context
if (!location.href.startsWith('chrome-extension://')) return

const { ipcRenderer } = require('electron')

const extensionId =
  typeof chrome !== 'undefined' ? chrome.runtime.id : undefined
const manifest = extensionId ? chrome.runtime.getManifest() : {}

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

function imageData2base64(imageData) {
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  ctx.putImageData(imageData, 0, 0);

  var image = new Image();
  return canvas.toDataURL();
}

const extMessage = (fnName, options = {}) =>
  async function() {
    let args = [...arguments]
    const callback =
      typeof args[args.length - 1] === 'function' ? args.pop() : undefined
    console.log(fnName, args)

    if (options.noop) {
      if (callback) callback()
      return
    }

    if (options.serialize) {
      args = options.serialize(...args)
    }

    if (options.includeId) {
      args.splice(0, 0, extensionId)
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
  setBadgeBackgroundColor: extMessage('browserAction.setBadgeBackgroundColor', {
    includeId: true
  }),
  setBadgeText: extMessage('browserAction.setBadgeText', { includeId: true }),
  setIcon: extMessage('browserAction.setIcon', {
    includeId: true,
    serialize: details => {
      if (details.imageData) {
        if (details.imageData instanceof ImageData) {
          details.imageData = imageData2base64(details.imageData)
        } else {
          details.imageData = Object.entries(details.imageData).reduce(
            (obj, pair) => {
              obj[pair[0]] = imageData2base64(pair[1])
              return obj
            },
            {}
          )
        }
      }

      return [details]
    }
  }),
  setTitle: extMessage('browserAction.setTitle', { includeId: true }),
  onClicked: new Event('browserAction.onClicked', { includeId: true })
}

// TODO: only created these in special webui context
Object.assign(browserAction, {
  getAll: extMessage('browserAction.getAll', { includeId: true })
})

const contextMenus = {
  create: extMessage('contextMenus.create', { noop: true }),
  remove: extMessage('contextMenus.remove', { noop: true }),
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
  contextMenus,
  privacy,
  tabs,
  webNavigation,
  webRequest,
  windows
})

if (manifest.browser_action) {
  chrome.browserAction = browserAction
}
