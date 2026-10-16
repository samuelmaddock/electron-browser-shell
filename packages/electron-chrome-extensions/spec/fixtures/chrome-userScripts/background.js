/* global chrome */

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message === 'ping') reply('pong')
  if (message === 'offscreen-ready') globalThis.offscreenReady = true
})

const isolated = `
  document.documentElement.dataset.world = chrome.runtime && chrome.runtime.id ? 'isolated' : 'none'
  chrome.runtime.sendMessage('ping', (reply) => {
    document.documentElement.dataset.reply = reply
  })
`

chrome.userScripts
  .register([
    { id: 'isolated', matches: ['<all_urls>'], js: [{ code: isolated }], runAt: 'document_start' },
    { id: 'main', matches: ['<all_urls>'], js: [{ file: 'main.js' }], world: 'MAIN' },
    {
      id: 'excluded',
      matches: ['<all_urls>'],
      excludeMatches: ['http://127.0.0.1/*'],
      js: [{ code: 'window.excluded = true' }],
      world: 'MAIN',
    },
  ])
  .then(() => console.log('background-script-evaluated'))
