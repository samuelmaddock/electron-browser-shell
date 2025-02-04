const fs = require('node:fs')

function readMessage() {
  let buffer = Buffer.alloc(4)
  if (fs.readSync(0, buffer, 0, 4, null) !== 4) {
    process.exit(1)
  }

  let messageLength = buffer.readUInt32LE(0)
  let messageBuffer = Buffer.alloc(messageLength)
  fs.readSync(0, messageBuffer, 0, messageLength, null)

  return JSON.parse(messageBuffer.toString())
}

function sendMessage(message) {
  let json = JSON.stringify(message)
  let buffer = Buffer.alloc(4 + json.length)
  buffer.writeUInt32LE(json.length, 0)
  buffer.write(json, 4)

  fs.writeSync(1, buffer)
}

const message = readMessage()
sendMessage(message)
