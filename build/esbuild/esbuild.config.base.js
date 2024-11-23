const esbuild = require('esbuild')

function createConfig(opts = {}) {
  const prod = process.env.NODE_ENV === 'production'
  return {
    bundle: true,
    platform: opts.platform || 'node',
    target: 'es2020',
    sourcemap: !prod,
    minify: false,
    external: [],
    watch: false,
    loader: {
      '.ts': 'ts',
      '.tsx': 'tsx',
      '.css': 'css',
    },
    ...opts,
  }
}

function build(config) {
  esbuild.build(config).catch(() => process.exit(1))
}

module.exports = { createConfig, build }
