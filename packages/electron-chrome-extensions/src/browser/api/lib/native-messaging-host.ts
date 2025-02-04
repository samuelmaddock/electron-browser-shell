import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import { ExtensionSender } from '../../router'

const d = require('debug')('electron-chrome-extensions:nativeMessaging')

interface NativeConfig {
  name: string
  description: string
  path: string
  type: 'stdio'
  allowed_origins: string[]
}

async function readNativeMessagingHostConfig(
  application: string,
): Promise<NativeConfig | undefined> {
  let searchPaths = [path.join(app.getPath('userData'), 'NativeMessagingHosts')]
  switch (process.platform) {
    case 'darwin':
      searchPaths.push('/Library/Google/Chrome/NativeMessagingHosts')
      break
    default:
      throw new Error('Unsupported platform')
  }

  for (const basePath of searchPaths) {
    const filePath = path.join(basePath, `${application}.json`)
    try {
      const data = await fs.readFile(filePath)
      return JSON.parse(data.toString())
    } catch {
      continue
    }
  }
}
export class NativeMessagingHost {
  private process?: ReturnType<typeof spawn>
  private sender: ExtensionSender
  private connectionId: string
  private connected: boolean = false
  private pending?: any[]

  constructor(
    extensionId: string,
    sender: ExtensionSender,
    connectionId: string,
    application: string,
  ) {
    this.sender = sender
    this.sender.ipc.on(`crx-native-msg-${connectionId}`, this.receiveExtensionMessage)
    this.connectionId = connectionId
    this.launch(application, extensionId)
  }

  destroy() {
    if (!this.connected) return
    this.connected = false
    if (this.process) {
      this.process.kill()
      this.process = undefined
    }
    this.sender.ipc.off(`crx-native-msg-${this.connectionId}`, this.receiveExtensionMessage)
    this.sender.send(`crx-native-msg-${this.connectionId}-disconnect`)
  }

  private async launch(application: string, extensionId: string) {
    const config = await readNativeMessagingHostConfig(application)
    if (!config) {
      d('launch: unable to find %s for %s', application, extensionId)
      this.destroy()
      return
    }

    d('launch: spawning %s for %s', config.path, extensionId)
    // TODO: must be a binary executable
    this.process = spawn(config.path, [`chrome-extension://${extensionId}/`], {
      shell: false,
    })

    this.process.stdout!.on('data', this.receive)
    this.process.stderr!.on('data', (data) => {
      d('stderr: %s', data.toString())
    })
    this.process.on('error', (err) => {
      d('error: %s', err)
      this.destroy()
    })
    this.process.on('exit', (code) => {
      d('exited %d', code)
      this.destroy()
    })

    this.connected = true

    if (this.pending && this.pending.length > 0) {
      d('sending %d pending messages', this.pending.length)
      this.pending.forEach((msg) => this.send(msg))
      this.pending = []
    }
  }

  private receiveExtensionMessage = (_event: Electron.IpcMainEvent, message: any) => {
    this.send(message)
  }

  private send(json: any) {
    d('send', json)

    if (!this.connected) {
      const pending = this.pending || (this.pending = [])
      pending.push(json)
      d('send: pending')
      return
    }

    const message = JSON.stringify(json)
    const buffer = Buffer.alloc(4 + message.length)
    buffer.writeUInt32LE(message.length, 0)
    buffer.write(message, 4)
    this.process!.stdin!.write(buffer)
  }

  private receive = (data: Buffer) => {
    const length = data.readUInt32LE(0)
    const message = JSON.parse(data.subarray(4, 4 + length).toString())
    d('receive: %s', message)
    this.sender.send(`crx-native-msg-${this.connectionId}`, message)
  }
}
