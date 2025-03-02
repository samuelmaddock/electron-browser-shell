const esbuild = require('esbuild')

function createConfig(opts = {}) {
  const prod = process.env.NODE_ENV === 'production'
  const define =
    opts.format === 'esm'
      ? {
          ...opts.define,
          __dirname: 'import.meta.dirname',
        }
      : {
          ...opts.define,
        }
  return {
    bundle: true,
    platform: opts.platform || 'node',
    target: 'es2020',
    sourcemap: !prod,
    minify: false,
    external: [],
    loader: {
      '.ts': 'ts',
      '.tsx': 'tsx',
      '.css': 'css',
    },
    ...opts,
    define,
  }
}

function build(config) {
  esbuild.build(config).catch(() => process.exit(1))
}

const EXTERNAL_BASE = [
  'node:crypto',
  'node:events',
  'node:fs',
  'node:module',
  'node:os',
  'node:path',
  'node:stream',
  'node:stream/promises',
  'electron',
  'debug',
]

module.exports = { createConfig, build, EXTERNAL_BASE }
