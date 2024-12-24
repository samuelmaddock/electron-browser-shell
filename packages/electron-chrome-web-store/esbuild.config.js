const packageJson = require('./package.json')
const { createConfig, build } = require('../../build/esbuild/esbuild.config.base')

console.log(`building ${packageJson.name}`)

const external = [
  'node:crypto',
  'node:fs',
  'node:os',
  'node:path',
  'node:stream',
  'node:stream/promises',
  'electron',
  'debug',
  'adm-zip',
  'pbf',
]

const esmOnlyModules = ['pbf']

const browserConfig = createConfig({
  entryPoints: ['src/browser/index.ts'],
  outfile: 'dist/cjs/browser/index.js',
  platform: 'node',
  external: external.filter((module) => !esmOnlyModules.includes(module)),
})

const browserESMConfig = createConfig({
  entryPoints: ['src/browser/index.ts'],
  outfile: 'dist/esm/browser/index.mjs',
  platform: 'neutral',
  external,
  format: 'esm',
})

build(browserConfig)
build(browserESMConfig)

const preloadConfig = createConfig({
  entryPoints: ['src/renderer/web-store-preload.ts'],
  outfile: 'dist/renderer/web-store-preload.js',
  platform: 'browser',
  external,
  sourcemap: false,
})

build(preloadConfig)
