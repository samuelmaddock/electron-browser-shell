export class ExtensionAPIState {
  tabs = new Set<Electron.WebContents>()
  extensionHosts = new Set<Electron.WebContents>()

  tabDetailsCache = new Map<number, Partial<chrome.tabs.Tab>>()

  constructor(public session: Electron.Session) {}

  sendToHosts(eventName: string, ...args: any[]) {
    this.extensionHosts.forEach((host) => {
      if (host.isDestroyed()) return
      host.send(eventName, ...args)
    })
  }

  sendToExtensionHost(extensionId: string, eventName: string, ...args: any[]) {
    const extensionPath = `chrome-extension://${extensionId}/`
    const extensionHost = Array.from(this.extensionHosts).find(
      (host) => !host.isDestroyed() && host.getURL().startsWith(extensionPath)
    )
    if (extensionHost) {
      extensionHost.send(eventName, ...args)
    } else {
      // TODO: need to wake up terminated lazy background hosts
      throw new Error(
        `[Extensions] Unable to send '${eventName}' to extension host for ${extensionId}`
      )
    }
  }

  getTabById(tabId: number) {
    return Array.from(this.tabs).find((tab) => !tab.isDestroyed() && tab.id === tabId)
  }
}
