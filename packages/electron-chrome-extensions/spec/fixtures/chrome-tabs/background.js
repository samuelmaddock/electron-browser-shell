/* global chrome */

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const { method, args } = message

  if (typeof chrome.tabs[method] === 'function') {
    chrome.tabs[method](...args, reply)
  }

  // Respond asynchronously
  return true;
});
