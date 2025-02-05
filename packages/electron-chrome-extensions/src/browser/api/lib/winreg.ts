import { spawn } from 'child_process'

export function readRegistryKey(hive: string, path: string, key?: string) {
  if (process.platform !== 'win32') {
    return Promise.reject('Unsupported platform')
  }

  return new Promise<string | null>((resolve, reject) => {
    const child = spawn('reg', ['query', `${hive}\\${path}`, ...(key ? ['/v', key] : [])])

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
