import { ipcRenderer } from 'electron'

export const addExtensionListener = (name: string, callback: Function) => {
  console.log(`${name}.addListener`)
  ipcRenderer.addListener(name, function (event, ...args) {
    if (process.env.NODE_ENV === 'development') {
      console.log('GOT CALLBACK', name, ...arguments)
    }
    callback(...args)
  })
}

export const removeExtensionListener = (name: string, callback: any) => {
  ipcRenderer.removeListener(name, callback)
}
