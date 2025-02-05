#!/usr/bin/env node

const { promises: fs } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const util = require('node:util')
const cp = require('node:child_process')
const exec = util.promisify(cp.exec)

const basePath = 'script/native-messaging-host/'
const outDir = path.join(__dirname, '.')
const exeName = `crxtesthost${process.platform === 'win32' ? '.exe' : ''}`
const seaBlobName = 'crxtesthost.blob'

async function createSEA() {
  await fs.rm(path.join(outDir, seaBlobName), { force: true })
  await fs.rm(path.join(outDir, exeName), { force: true })

  await exec('node --experimental-sea-config sea-config.json', { cwd: outDir })
  await fs.cp(process.execPath, path.join(outDir, exeName))

  if (process.platform === 'darwin') {
    await exec(`codesign --remove-signature ${exeName}`, { cwd: outDir })
  }

  console.info(`Building ${exeName}…`)
  const buildCmd = [
    'npx postject',
    `${basePath}${exeName}`,
    'NODE_SEA_BLOB',
    `${basePath}${seaBlobName}`,
    '--sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
    ...(process.platform === 'darwin' ? ['--macho-segment-name NODE_SEA'] : []),
  ]
  await exec(buildCmd.join(' '), { cwd: outDir })

  if (process.platform === 'darwin') {
    await exec(`codesign --sign - ${exeName}`, { cwd: outDir })
  }
}

async function installConfig(extensionIds) {
  console.info(`Installing config…`)

  const name = 'com.crx.test'
  const config = {
    name,
    description: 'electron-chrome-extensions test',
    path: path.join(outDir, exeName),
    type: 'stdio',
    allowed_origins: extensionIds.map((id) => `chrome-extension://${id}/`),
  }

  switch (process.platform) {
    case 'darwin': {
      const configPath = path.join(
        os.homedir(),
        'Library',
        'Application Support',
        'Electron',
        'NativeMessagingHosts',
      )
      await fs.mkdir(configPath, { recursive: true })
      const filePath = path.join(configPath, `${name}.json`)
      const data = Buffer.from(JSON.stringify(config, null, 2))
      await fs.writeFile(filePath, data)
      break
    }
    default:
      return
  }
}

async function main() {
  const extensionIdsArg = process.argv[2]
  if (!extensionIdsArg) {
    console.error('Must pass in csv of allowed extension IDs')
    process.exit(1)
  }

  const extensionIds = extensionIdsArg.split(',')
  await createSEA()
  await installConfig(extensionIds)
}

main()
