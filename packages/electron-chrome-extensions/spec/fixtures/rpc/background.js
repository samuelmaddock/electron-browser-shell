/* global chrome */

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const { method, args } = message

  const [apiName, subMethod] = method.split('.')
  
  if (typeof chrome[apiName][subMethod] === 'function') {
    chrome[apiName][subMethod](...args, reply)
  }

  // Respond asynchronously
  return true;
});
