/* eslint-disable */

function evalInMainWorld(fn) {
  const script = document.createElement('script')
  script.textContent = `((${fn})())`
  document.documentElement.appendChild(script)
}

chrome.runtime.onMessage.addListener((message) => {
  const funcStr = `() => { electronTest.sendIpc('success', ${JSON.stringify(message)}) }`
  evalInMainWorld(funcStr)
})
