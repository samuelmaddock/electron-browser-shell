const packageJson = require('./package.json');
const { createConfig, build } = require('../../build/esbuild/esbuild.config.base')

console.log(`building ${packageJson.name}`);

const browserConfig = createConfig({
  entry: 'src/browser/index.ts',
  outfile: 'dist/browser/index.js',
  platform: 'node',
  external: ['electron'],
})

build(browserConfig)

const preloadConfig = createConfig({
  entry: 'src/renderer/web-store-preload.ts',
  outfile: 'dist/renderer/web-store-preload.js',
  platform: 'browser',
  external: ['electron'],
})

build(preloadConfig)
