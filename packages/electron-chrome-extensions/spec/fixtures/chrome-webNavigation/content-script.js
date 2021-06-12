/* eslint-disable */

function evalInMainWorld(fn) {
  const script = document.createElement('script')
  script.textContent = `((${fn})())`
  document.documentElement.appendChild(script)
}

chrome.runtime.onMessage.addListener(({ name, args }) => {
  const funcStr = `() => { electronTest.sendIpc(${JSON.stringify(name)}, ${JSON.stringify(args)}) }`
  evalInMainWorld(funcStr)
})
