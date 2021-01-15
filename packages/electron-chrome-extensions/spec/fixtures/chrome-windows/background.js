/* global chrome */

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const { method, args } = message

  if (typeof chrome.windows[method] === 'function') {
    chrome.windows[method](...args, reply)
  }

  // Respond asynchronously
  return true;
});
