export class ExtensionAPIState {
  tabs = new Set<Electron.WebContents>()
  extensionHosts = new Set<Electron.WebContents>()

  constructor(public session: Electron.Session) {}

  sendToHosts(eventName: string, ...args: any[]) {
    this.extensionHosts.forEach((host) => {
      if (host.isDestroyed()) return
      host.send(eventName, ...args)
    })
  }

  getTabById(tabId: number) {
    return Array.from(this.tabs).find((tab) => !tab.isDestroyed() && tab.id === tabId)
  }
}
