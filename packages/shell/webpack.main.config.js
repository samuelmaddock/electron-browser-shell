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
        require.resolve('electron-chrome-extensions/preload'),
        require.resolve('electron-chrome-web-store/preload'),
      ],
    }),
  ],
}
