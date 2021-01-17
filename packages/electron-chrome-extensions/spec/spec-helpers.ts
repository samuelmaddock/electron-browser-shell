// Copyright (c) 2013-2020 GitHub Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import * as childProcess from 'child_process'
import * as path from 'path'
import * as http from 'http'
import * as v8 from 'v8'
import { SuiteFunction, TestFunction } from 'mocha'

const addOnly = <T>(fn: Function): T => {
  const wrapped = (...args: any[]) => {
    return fn(...args)
  }
  ;(wrapped as any).only = wrapped
  ;(wrapped as any).skip = wrapped
  return wrapped as any
}

export const ifit = (condition: boolean) => (condition ? it : addOnly<TestFunction>(it.skip))
export const ifdescribe = (condition: boolean) =>
  condition ? describe : addOnly<SuiteFunction>(describe.skip)

export const delay = (time: number = 0) => new Promise((resolve) => setTimeout(resolve, time))

type CleanupFunction = (() => void) | (() => Promise<void>)
const cleanupFunctions: CleanupFunction[] = []
export async function runCleanupFunctions() {
  for (const cleanup of cleanupFunctions) {
    const r = cleanup()
    if (r instanceof Promise) {
      await r
    }
  }
  cleanupFunctions.length = 0
}

export function defer(f: CleanupFunction) {
  cleanupFunctions.unshift(f)
}

class RemoteControlApp {
  process: childProcess.ChildProcess
  port: number

  constructor(proc: childProcess.ChildProcess, port: number) {
    this.process = proc
    this.port = port
  }

  remoteEval = (js: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: this.port,
          method: 'POST',
        },
        (res) => {
          const chunks = [] as Buffer[]
          res.on('data', (chunk) => {
            chunks.push(chunk)
          })
          res.on('end', () => {
            const ret = v8.deserialize(Buffer.concat(chunks))
            if (Object.prototype.hasOwnProperty.call(ret, 'error')) {
              reject(new Error(`remote error: ${ret.error}\n\nTriggered at:`))
            } else {
              resolve(ret.result)
            }
          })
        }
      )
      req.write(js)
      req.end()
    })
  }

  remotely = (script: Function, ...args: any[]): Promise<any> => {
    return this.remoteEval(`(${script})(...${JSON.stringify(args)})`)
  }
}

export async function startRemoteControlApp() {
  const appPath = path.join(__dirname, 'fixtures', 'apps', 'remote-control')
  const appProcess = childProcess.spawn(process.execPath, [appPath])
  appProcess.stderr.on('data', (d) => {
    process.stderr.write(d)
  })
  const port = await new Promise<number>((resolve) => {
    appProcess.stdout.on('data', (d) => {
      const m = /Listening: (\d+)/.exec(d.toString())
      if (m && m[1] != null) {
        resolve(Number(m[1]))
      }
    })
  })
  defer(() => {
    appProcess.kill('SIGINT')
  })
  return new RemoteControlApp(appProcess, port)
}

export async function getFiles(directoryPath: string, { filter = null }: any = {}) {
  const files: string[] = []
  const walker = require('walkdir').walk(directoryPath, {
    no_recurse: true,
  })
  walker.on('file', (file: string) => {
    if (!filter || filter(file)) {
      files.push(file)
    }
  })
  await new Promise((resolve) => walker.on('end', resolve))
  return files
}

export const uuid = () => require('uuid').v4()
