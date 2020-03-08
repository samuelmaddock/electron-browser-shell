const { ipcRenderer } = require('electron')

class WebUI {
  activeTabId = -1
  tabList = []

  constructor() {
    const $ = document.querySelector.bind(document)

    this.$ = {
      tabList: $('#tabstrip .tab-list'),
      tabTemplate: $('#tabtemplate'),
      createTabButton: $('#createtab'),
      reloadButton: $('#reload'),
      addressUrl: $('#addressurl'),

      minimizeButton: $('#minimize'),
      maximizeButton: $('#maximize'),
      closeButton: $('#close')
    }

    this.$.createTabButton.addEventListener(
      'click',
      this.onCreateTab.bind(this)
    )
    this.$.reloadButton.addEventListener('click', this.reloadTab.bind(this))
    this.$.addressUrl.addEventListener(
      'keypress',
      this.onAddressUrlKeyPress.bind(this)
    )

    this.$.minimizeButton.addEventListener('click', () =>
      ipcRenderer.invoke('minimize-window')
    )
    this.$.maximizeButton.addEventListener('click', () =>
      ipcRenderer.invoke('maximize-window')
    )
    this.$.closeButton.addEventListener('click', () => window.close())

    this.setupBrowserListeners()
    this.initTabs()
  }

  setupBrowserListeners() {
    chrome.tabs.onCreated.addListener(tab => {
      this.tabList.push(tab)
      this.renderTabs()
    })

    chrome.tabs.onActivated.addListener(activeInfo => {
      this.activeTabId = activeInfo.tabId

      const tab = this.tabList.find(tab => tab.id === this.activeTabId)
      if (tab) this.renderToolbar(tab)

      this.initTabs() // get updated info on all tabs
    })

    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      const tab = this.tabList.find(tab => tab.id === tabId)
      if (!tab) return
      Object.assign(tab, changeInfo)
      this.renderTabs()
      if (tabId === this.activeTabId) this.renderToolbar(tab)
    })

    chrome.tabs.onRemoved.addListener(tabId => {
      const tabIndex = this.tabList.findIndex(tab => tab.id === tabId)
      if (tabIndex > -1) {
        this.tabList.splice(tabIndex, 1)
        this.$.tabList.querySelector(`[data-tab-id="${tabId}"]`).remove()
      }
    })
  }

  async initTabs() {
    const tabs = await new Promise(resolve =>
      chrome.tabs.getAllInWindow(resolve)
    )
    this.tabList = [...tabs]
    this.renderTabs()

    const activeTab = this.tabList.find(tab => tab.active)
    this.activeTabId = activeTab.id
    this.renderToolbar(activeTab)
  }

  onCreateTab() {
    ipcRenderer.invoke('create-tab')
  }

  reloadTab() {
    ipcRenderer.invoke('reload-tab')
  }

  onAddressUrlKeyPress(event) {
    if (event.code === 'Enter') {
      const url = this.$.addressUrl.value
      ipcRenderer.invoke('navigate-tab', url)
    }
  }

  createTabNode(tab) {
    const tabElem = this.$.tabTemplate.content.cloneNode(true).firstElementChild
    tabElem.dataset.tabId = tab.id

    tabElem.addEventListener('click', () => {
      ipcRenderer.invoke('select-tab', tab.id)
    })
    tabElem.querySelector('.close').addEventListener('click', () => {
      ipcRenderer.invoke('remove-tab', tab.id)
    })

    this.$.tabList.appendChild(tabElem)
    return tabElem
  }

  renderTabs() {
    this.tabList.forEach(tab => {
      let tabElem = this.$.tabList.querySelector(`[data-tab-id="${tab.id}"]`)
      if (!tabElem) tabElem = this.createTabNode(tab)

      if (tab.active) {
        tabElem.dataset.active = ''
      } else {
        delete tabElem.dataset.active
      }

      const favicon = tabElem.querySelector('.favicon')
      if (tab.favIconUrl) {
        favicon.src = tab.favIconUrl
      } else {
        delete favicon.src
      }

      tabElem.querySelector('.title').textContent = tab.title
      tabElem.querySelector('.audio').disabled = !tab.audible
    })
  }

  renderToolbar(tab) {
    this.$.addressUrl.value = tab.url
  }
}

window.webui = new WebUI()
