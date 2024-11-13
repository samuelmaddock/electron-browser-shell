const esbuild = require('esbuild')

function createConfig({ entry, outfile, platform = 'node', external = [], watch = false }) {
  const prod = process.env.NODE_ENV === 'production'
  return {
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform,
    target: 'es2020',
    sourcemap: !prod,
    minify: prod,
    external,
    watch,
    loader: {
      '.ts': 'ts',
      '.tsx': 'tsx',
      '.css': 'css',
    },
  }
}

function build(config) {
  esbuild.build(config).catch(() => process.exit(1))
}

module.exports = { createConfig, build }
