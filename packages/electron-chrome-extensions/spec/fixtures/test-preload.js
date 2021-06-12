const { contextBridge, ipcRenderer } = require('electron')

// This should go without saying, but you should never do this in a production
// app. These bindings are purely for testing convenience.
const apiName = 'electronTest'
const api = {
  sendIpc(...args) {
    return ipcRenderer.send(...args)
  },
  invokeIpc(...args) {
    return ipcRenderer.invoke(...args)
  }
}

try {
  contextBridge.exposeInMainWorld(apiName, api)
} catch {
  window[apiName] = api
}
