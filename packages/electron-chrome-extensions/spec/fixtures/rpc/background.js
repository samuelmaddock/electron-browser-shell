/* global chrome */

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  switch (message.type) {
    case 'api': {
      const { method, args } = message

      const [apiName, subMethod] = method.split('.')

      if (typeof chrome[apiName][subMethod] === 'function') {
        chrome[apiName][subMethod](...args, reply)
      }

      break
    }

    case 'event-once': {
      const { name } = message

      const [apiName, eventName] = name.split('.')

      if (typeof chrome[apiName][eventName] === 'object') {
        const event = chrome[apiName][eventName]
        event.addListener(function callback(...args) {
          if (chrome.runtime.lastError) {
            reply(chrome.runtime.lastError)
          } else {
            reply(args)
          }

          event.removeListener(callback)
        })
      }
    }
  }

  // Respond asynchronously
  return true
})
