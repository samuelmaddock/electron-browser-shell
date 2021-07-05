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

const Module = require('module')
const path = require('path')
const { promises: fs } = require('fs')
const v8 = require('v8')

Module.globalPaths.push(path.resolve(__dirname, '../spec/node_modules'))

// We want to terminate on errors, not throw up a dialog
process.on('uncaughtException', (err) => {
  console.error('Unhandled exception in main spec runner:', err)
  process.exit(1)
})

// Tell ts-node which tsconfig to use
process.env.TS_NODE_PROJECT = path.resolve(__dirname, '../tsconfig.json')
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'

const { app, protocol } = require('electron')

v8.setFlagsFromString('--expose_gc')
app.commandLine.appendSwitch('js-flags', '--expose_gc')
app.commandLine.appendSwitch('enable-features', 'ElectronSerialChooser')
// Prevent the spec runner quiting when the first window closes
app.on('window-all-closed', () => null)

// Use fake device for Media Stream to replace actual camera and microphone.
app.commandLine.appendSwitch('use-fake-device-for-media-stream')

// @ts-ignore
global.standardScheme = 'app'
// @ts-ignore
global.zoomScheme = 'zoom'
protocol.registerSchemesAsPrivileged([
  // @ts-ignore
  { scheme: global.standardScheme, privileges: { standard: true, secure: true, stream: false } },
  // @ts-ignore
  { scheme: global.zoomScheme, privileges: { standard: true, secure: true } },
  { scheme: 'cors-blob', privileges: { corsEnabled: true, supportFetchAPI: true } },
  { scheme: 'cors', privileges: { corsEnabled: true, supportFetchAPI: true } },
  { scheme: 'no-cors', privileges: { supportFetchAPI: true } },
  { scheme: 'no-fetch', privileges: { corsEnabled: true } },
  { scheme: 'stream', privileges: { standard: true, stream: true } },
  { scheme: 'foo', privileges: { standard: true } },
  { scheme: 'bar', privileges: { standard: true } },
  { scheme: 'crx', privileges: { bypassCSP: true } },
])

const cleanupTestSessions = async () => {
  const sessionsPath = path.join(app.getPath('userData'), 'Partitions')

  let sessions

  try {
    sessions = await fs.readdir(sessionsPath)
  } catch (e) {
    return // dir doesn't exist
  }

  sessions = sessions.filter((session) => session.startsWith('crx-'))
  if (sessions.length === 0) return

  console.log(`Cleaning up ${sessions.length} sessions from previous test runners`)

  for (const session of sessions) {
    const sessionPath = path.join(sessionsPath, session)
    await fs.rm(sessionPath, { recursive: true, force: true })
  }
}

app
  .whenReady()
  .then(async () => {
    require('ts-node/register')

    await cleanupTestSessions()

    const argv = require('yargs')
      .boolean('ci')
      .array('files')
      .string('g')
      .alias('g', 'grep')
      .boolean('i')
      .alias('i', 'invert').argv

    const Mocha = require('mocha')
    const mochaOptions = {}
    if (process.env.MOCHA_REPORTER) {
      mochaOptions.reporter = process.env.MOCHA_REPORTER
    }
    if (process.env.MOCHA_MULTI_REPORTERS) {
      mochaOptions.reporterOptions = {
        reporterEnabled: process.env.MOCHA_MULTI_REPORTERS,
      }
    }
    const mocha = new Mocha(mochaOptions)

    // The cleanup method is registered this way rather than through an
    // `afterEach` at the top level so that it can run before other `afterEach`
    // methods.
    //
    // The order of events is:
    // 1. test completes,
    // 2. `defer()`-ed methods run, in reverse order,
    // 3. regular `afterEach` hooks run.
    const { runCleanupFunctions, getFiles } = require('./spec-helpers')
    mocha.suite.on('suite', function attach(suite) {
      suite.afterEach('cleanup', runCleanupFunctions)
      suite.on('suite', attach)
    })

    if (!process.env.MOCHA_REPORTER) {
      mocha.ui('bdd').reporter('tap')
    }
    const mochaTimeout = process.env.MOCHA_TIMEOUT || 30000
    mocha.timeout(mochaTimeout)

    if (argv.grep) mocha.grep(argv.grep)
    if (argv.invert) mocha.invert()

    const filter = (file) => {
      if (!/-spec\.[tj]s$/.test(file)) {
        return false
      }

      // This allows you to run specific modules only:
      // npm run test -match=menu
      const moduleMatch = process.env.npm_config_match
        ? new RegExp(process.env.npm_config_match, 'g')
        : null
      if (moduleMatch && !moduleMatch.test(file)) {
        return false
      }

      const baseElectronDir = path.resolve(__dirname, '..')
      if (argv.files && !argv.files.includes(path.relative(baseElectronDir, file))) {
        return false
      }

      return true
    }

    const testFiles = await getFiles(__dirname, { filter })
    testFiles.sort().forEach((file) => {
      mocha.addFile(file)
    })

    const cb = () => {
      // Ensure the callback is called after runner is defined
      process.nextTick(() => {
        process.exit(runner.failures)
      })
    }

    // Set up chai in the correct order
    const chai = require('chai')
    chai.use(require('chai-as-promised'))
    // chai.use(require('dirty-chai'));

    const runner = mocha.run(cb)
  })
  .catch((err) => {
    console.error('An error occurred while running the spec-main spec runner')
    console.error(err)
    process.exit(1)
  })
