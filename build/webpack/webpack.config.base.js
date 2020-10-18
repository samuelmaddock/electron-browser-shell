const webpack = require('webpack')

const base = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  devtool: 'source-map',

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
}

module.exports = base