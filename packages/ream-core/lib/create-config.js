const path = require('path')
const webpack = require('webpack')
const Config = require('webpack-chain')
const nodeExternals = require('webpack-node-externals')
const HtmlPlugin = require('html-webpack-plugin')
const PostCompilePlugin = require('post-compile-webpack-plugin')

module.exports = (ctx, type) => {
  const config = new Config()

  const dist = `dist-${type}`
  const outputPath = path.join(ctx.output.path, dist)
  config.output
    .path(outputPath)
    .filename('[name].js')
    .publicPath('/_ream/')

  config.performance.hints(false)

  config.node
    .set('fs', 'empty')
    .set('net', 'empty')
    .set('tls', 'empty')

  if (type === 'client') {
    config.entry('main')
      .add(ctx.ownDir('app/client-polyfills.js'))
  }

  config.entry('main')
    .add(path.join(ctx.renderer.appPath, `${type}.js`))

  config.resolve.alias
    .set('entry-of-user-app$', ctx.resolvePath(ctx.entry))

  config.resolve.symlinks(true)

  config.resolve.modules
    .add('node_modules')
    .add(path.resolve('node_modules'))
    .add(ctx.ownDir('node_modules'))

  config.resolveLoader.modules
    .add('node_modules')
    .add(path.resolve('node_modules'))
    .add(ctx.ownDir('node_modules'))

  // Transform core app
  config.module.rule('ream-js')
    .test(/\.js$/)
    .include
      .add(ctx.ownDir('app'))

  // Transform user app
  config.module.rule('js')
    .test(/\.js$/)
    .exclude
      .add(/node_modules/)
      .end()
    .use('babel-loader')
      .loader('babel-loader')
      .options({
        presets: [require.resolve('babel-preset-ream')]
      })

  config.plugin('constants')
    .use(webpack.DefinePlugin, [{
      'process.env.NODE_ENV': JSON.stringify(ctx.dev ? 'development' : 'production'),
      'process.isServer': JSON.stringify(type === 'server'),
      'process.isBrowser': JSON.stringify(type === 'client'),
    }])

  const logStats = stats => {
    const statsOption = {
      children: false,
      chunks: false,
      modules: false,
      colors: true,
      hash: false,
      version: false
    }
    console.log(stats.toString(statsOption))

    if (ctx.dev && type === 'client') {
      console.log(`> Open http://${ctx.host}:${ctx.port}`)
    }
  }

  config.plugin('report-stats')
    .use(PostCompilePlugin, [logStats])

  if (type === 'server') {
    config.devtool(ctx.dev ? 'source-map' : false)
    config.target('node')

    config.output.libraryTarget('commonjs2')

    config.externals([
      nodeExternals({
        whitelist: [/\.(?!(?:js|json)$).{1,5}$/i]
      })
    ])
  }

  if (type === 'client') {
    config.devtool(ctx.dev ? 'eval-source-map' : 'source-map')

    config.plugin('html')
      .use(HtmlPlugin, [{}])

    config.plugin('commons')
      .use(webpack.optimize.CommonsChunkPlugin, [{
        name: 'commons',
        filename: 'commons.js',
        minChunks(module, count) {
          if (ctx.dev) {
            return module.context && module.context.indexOf('node_modules') >= 0
          }

          return count > 2
        }
      }])

    config.plugin('commons-manifest')
      .use(webpack.optimize.CommonsChunkPlugin, [{
        name: 'manifest'
      }])

    if (ctx.dev) {
      config.entry('main')
        .prepend(ctx.ownDir('app/dev-client.js'))

      config.plugin('hmr')
        .use(webpack.HotModuleReplacementPlugin)
    }
  }

  if (!ctx.dev) {
    // Do not tend to continue bundling when there's error
    config.bail(true)

    if (type === 'client') {
      const ProgressPlugin = require('webpack/lib/ProgressPlugin')

      config.plugin('progress')
        .use(ProgressPlugin)

      const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')

      config.plugin('bundle-report')
        .use(BundleAnalyzerPlugin)
    }

    config.plugin('uglifyjs')
      .use(webpack.optimize.UglifyJsPlugin, [{
        sourceMap: true,
        /* eslint-disable camelcase */
        compressor: {
          warnings: false,
          conditionals: true,
          unused: true,
          comparisons: true,
          sequences: true,
          dead_code: true,
          evaluate: true,
          if_return: true,
          join_vars: true,
          negate_iife: false
        },
        /* eslint-enable camelcase */
        output: {
          comments: false
        }
      }])
  }

  return config
}
