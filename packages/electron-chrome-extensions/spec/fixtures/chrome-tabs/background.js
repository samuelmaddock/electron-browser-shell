/* global chrome */

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const { method, args } = message

  switch (method) {
    case 'get':
      chrome.tabs.get(...args, reply)
      break;
    case 'update':
      chrome.tabs.update(...args, reply)
      break;
  }

  // Respond asynchronously
  return true;
});
