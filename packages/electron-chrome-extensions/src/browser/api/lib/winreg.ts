import { spawn } from 'child_process'
import debug from 'debug'

const d = debug('electron-chrome-extensions:winreg')

export function readRegistryKey(hive: string, path: string, key?: string) {
  if (process.platform !== 'win32') {
    return Promise.reject('Unsupported platform')
  }

  return new Promise<string | null>((resolve, reject) => {
    const args = ['query', `${hive}\\${path}`, ...(key ? ['/v', key] : [])]
    d('reg %s', args.join(' '))
    const child = spawn('reg', args)

    let output = ''
    let error = ''

    child.stdout.on('data', (data) => {
      output += data.toString()
    })

    child.stderr.on('data', (data) => {
      error += data.toString()
    })

    child.on('close', (code) => {
      if (code !== 0 || error) {
        return reject(new Error(`Failed to read registry: ${error}`))
      }

      const lines = output.trim().split('\n')
      const resultLine = lines.find((line) =>
        key ? line.includes(key) : line.includes('(Default)'),
      )

      if (resultLine) {
        const parts = resultLine.trim().split(/\s{2,}/)
        resolve(parts.pop() || null)
      } else {
        resolve(null)
      }
    })
  })
}
