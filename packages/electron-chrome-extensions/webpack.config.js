const path = require('path');
const webpack = require('webpack');

const base = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            cacheDirectory: true,
          },
        },
      },
    ],
  },

  resolve: {
    extensions: ['.js', '.jsx', '.json', '.ts', '.tsx'],
    modules: ['node_modules'],
  },

  plugins: [
    // new webpack.EnvironmentPlugin({
    //   NODE_ENV: 'production',
    // }),

    new webpack.NamedModulesPlugin(),
  ],
};

const main = {
  ...base,
  devtool: 'source-map',

  target: 'electron-main',
  
  entry: {
    index: './src/index.ts'
  },

  output: {
    path: path.join(__dirname, 'dist'),
    // https://github.com/webpack/webpack/issues/1114
    libraryTarget: 'commonjs2',
  },
}

const preload = {
  ...base,

  devtool: 'source-map',
  
  target: 'electron-preload',
  
  entry: {
    preload: './src/preload.ts'
  },

  output: {
    path: path.join(__dirname, 'dist'),
  },
}

module.exports = [main, preload]