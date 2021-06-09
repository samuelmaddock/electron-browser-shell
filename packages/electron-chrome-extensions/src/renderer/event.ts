import { ipcRenderer } from 'electron'

const formatIpcName = (name: string) => `CRX_${name}`

export const addExtensionListener = (name: string, callback: Function) => {
  ipcRenderer.addListener(formatIpcName(name), function (event, ...args) {
    if (process.env.NODE_ENV === 'development') {
      console.log(name, '(result)', ...args)
    }
    callback(...args)
  })
}

export const removeExtensionListener = (name: string, callback: any) => {
  ipcRenderer.removeListener(formatIpcName(name), callback)
}
