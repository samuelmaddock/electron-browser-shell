/* global chrome */

const eventNames = [
  'onBeforeNavigate',
  'onCommitted',
  'onCompleted',
  'onCreatedNavigationTarget',
  'onDOMContentLoaded',
  'onErrorOccurred',
  'onHistoryStateUpdated',
  'onReferenceFragmentUpdated',
  'onTabReplaced',
]

let activeTabId

let eventLog = []
const logEvent = (eventName) => {
  if (eventName) eventLog.push(eventName)
  if (typeof activeTabId === 'undefined') return

  eventLog.forEach(eventName => {
    chrome.tabs.sendMessage(activeTabId, { name: 'logEvent', args: eventName })
  })

  eventLog = []
}

eventNames.forEach((eventName) => {
  chrome.webNavigation[eventName].addListener(() => {
    logEvent(eventName)
  })
})

chrome.tabs.query({ active: true, windowId: chrome.windows.WINDOW_ID_CURRENT }, ([tab]) => {
  activeTabId = tab.id
  logEvent()
})
