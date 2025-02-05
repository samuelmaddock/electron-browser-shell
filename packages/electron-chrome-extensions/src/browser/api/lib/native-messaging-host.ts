import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import { ExtensionSender } from '../../router'
import { readRegistryKey } from './winreg'

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
  let searchPaths: string[]
  switch (process.platform) {
    case 'darwin':
      searchPaths = [
        path.join(app.getPath('userData'), 'NativeMessagingHosts', `${application}.json`),
        path.join('/Library/Google/Chrome/NativeMessagingHosts', `${application}.json`),
      ]
      break
    case 'linux':
      searchPaths = [
        path.join(app.getPath('userData'), 'NativeMessagingHosts', `${application}.json`),
        path.join('/etc/opt/chrome/native-messaging-hosts/', `${application}.json`),
      ]
      break
    case 'win32': {
      searchPaths = (
        await Promise.allSettled([
          readRegistryKey('HKLM', '\\Software\\Google\\Chrome\\NativeMessagingHosts', application),
          readRegistryKey('HKCU', '\\Software\\Google\\Chrome\\NativeMessagingHosts', application),
        ])
      )
        .map((result) => (result.status === 'fulfilled' ? result.value : undefined))
        .filter(Boolean) as string[]
      break
    }
    default:
      throw new Error('Unsupported platform')
  }

  for (const filePath of searchPaths) {
    try {
      const data = await fs.readFile(filePath)
      return JSON.parse(data.toString())
    } catch (error) {
      d('readNativeMessagingHostConfig: unable to read %s', filePath, error)
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
  private keepAlive: boolean
  private resolveResponse?: (message: any) => void

  ready?: Promise<void>

  constructor(
    extensionId: string,
    sender: ExtensionSender,
    connectionId: string,
    application: string,
    keepAlive: boolean = true,
  ) {
    this.keepAlive = keepAlive
    this.sender = sender
    if (keepAlive) {
      this.sender.ipc.on(`crx-native-msg-${connectionId}`, this.receiveExtensionMessage)
    }
    this.connectionId = connectionId
    this.ready = this.launch(application, extensionId)
  }

  destroy() {
    if (!this.connected) return
    this.connected = false
    if (this.process) {
      this.process.kill()
      this.process = undefined
    }
    if (this.keepAlive) {
      this.sender.ipc.off(`crx-native-msg-${this.connectionId}`, this.receiveExtensionMessage)
      this.sender.send(`crx-native-msg-${this.connectionId}-disconnect`)
    }
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
    if (this.keepAlive) {
      this.sender.send(`crx-native-msg-${this.connectionId}`, message)
    } else {
      this.resolveResponse?.(message)
    }
  }

  sendAndReceive(message: any) {
    this.send(message)
    return new Promise((resolve) => {
      this.resolveResponse = resolve
    })
  }
}
