const path = require('path')
const CopyWebpackPlugin = require('copy-webpack-plugin')

module.exports = {
  entry: './index.js',
  module: {
    rules: [],
  },
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'browser/ui'),
          to: path.resolve(__dirname, '.webpack/main/ui'),
        },
        {
          from: path.resolve(__dirname, '../../node_modules/electron-chrome-extensions/dist'),
          to: path.resolve(__dirname, '.webpack/main/electron-chrome-extensions/dist'),
        },
        {
          from: path.resolve(__dirname, '../../extensions'),
          to: path.resolve(__dirname, '.webpack/main/extensions'),
        },
      ],
    }),
  ],
}
