const path = require('path')
const webpackBase = require('../../build/webpack/webpack.config.base')

const main = {
  ...webpackBase,

  target: 'electron-main',

  entry: {
    index: './src/index.ts',
  },

  node: {
    __dirname: false
  },

  output: {
    path: path.join(__dirname, 'dist'),
    // https://github.com/webpack/webpack/issues/1114
    libraryTarget: 'commonjs2',
  },
}

const preload = {
  ...webpackBase,

  target: 'electron-preload',

  entry: {
    preload: './src/preload.ts'
  },

  output: {
    path: path.join(__dirname, 'dist'),
  },
}

const libs = {
  ...webpackBase,

  target: 'electron-preload',

  entry: {
    'browser-action': './src/browser-action.ts',
  },

  output: {
    path: path.join(__dirname, 'dist'),
    libraryTarget: 'commonjs2',
  },
}

module.exports = [main, preload, libs]
