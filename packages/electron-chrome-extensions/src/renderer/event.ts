import { ipcRenderer } from 'electron'

const formatIpcName = (name: string) => `CRX_${name}`

const listenerMap = new Map<string, number>()

export const addExtensionListener = (name: string, callback: Function) => {
  const listenerCount = listenerMap.get(name) || 0

  if (listenerCount === 0) {
    // TODO: should these IPCs be batched in a microtask?
    ipcRenderer.send('CRX_SET_LISTENER', name, true)
  }

  listenerMap.set(name, listenerCount + 1)

  ipcRenderer.addListener(formatIpcName(name), function (event, ...args) {
    if (process.env.NODE_ENV === 'development') {
      console.log(name, '(result)', ...args)
    }
    callback(...args)
  })
}

export const removeExtensionListener = (name: string, callback: any) => {
  if (listenerMap.has(name)) {
    const listenerCount = listenerMap.get(name) || 0

    if (listenerCount <= 1) {
      listenerMap.delete(name)

      ipcRenderer.invoke('CRX_SET_LISTENER', name, false)
    } else {
      listenerMap.set(name, listenerCount - 1)
    }
  }

  ipcRenderer.removeListener(formatIpcName(name), callback)
}
