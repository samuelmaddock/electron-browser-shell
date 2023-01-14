/* global chrome */

chrome.browserAction.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, tab)
})

console.log('background-script-evaluated')
