const packageJson = require('./package.json')
const { createConfig, build, EXTERNAL_BASE } = require('../../build/esbuild/esbuild.config.base')

console.log(`building ${packageJson.name}`)

const external = [...EXTERNAL_BASE, 'electron-chrome-extensions/preload']

const browserConfig = createConfig({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/cjs/index.js',
  platform: 'node',
  external,
})

const browserESMConfig = createConfig({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/esm/index.mjs',
  platform: 'node',
  external,
  format: 'esm',
})

build(browserConfig)
build(browserESMConfig)

const preloadConfig = createConfig({
  entryPoints: ['src/preload.ts'],
  outfile: 'dist/chrome-extension-api.preload.js',
  platform: 'browser',
  external,
  sourcemap: false,
})

build(preloadConfig)

const browserActionPreloadConfig = createConfig({
  entryPoints: ['src/browser-action.ts'],
  outfile: 'dist/cjs/browser-action.js',
  platform: 'browser',
  format: 'cjs',
  external,
  sourcemap: false,
})

const browserActionESMPreloadConfig = createConfig({
  entryPoints: ['src/browser-action.ts'],
  outfile: 'dist/esm/browser-action.mjs',
  platform: 'browser',
  external,
  sourcemap: false,
  format: 'esm',
})

build(browserActionPreloadConfig)
build(browserActionESMPreloadConfig)
