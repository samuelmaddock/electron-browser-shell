/* eslint-disable */

function evalInMainWorld(fn) {
  const script = document.createElement('script')
  script.textContent = `((${fn})())`
  document.documentElement.appendChild(script)
}

async function exec(action) {
  const result = await new Promise(resolve => {
    chrome.runtime.sendMessage(action, resolve)
  })

  console.log('***test1', result)
  const funcStr = `() => { require('electron').ipcRenderer.send('success', ${JSON.stringify(result)}) }`
  evalInMainWorld(funcStr)
}

window.addEventListener('message', event => {
  exec(event.data)
})

evalInMainWorld(() => {
  window.exec = json => window.postMessage(JSON.parse(json))
})
