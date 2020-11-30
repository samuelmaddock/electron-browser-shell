import { ipcRenderer } from 'electron'

export const addExtensionListener = (name: string, callback: Function) => {
  ipcRenderer.addListener(name, function (event, ...args) {
    callback(...args)
  })
}

export const removeExtensionListener = (name: string, callback: any) => {
  ipcRenderer.removeListener(name, callback)
}
