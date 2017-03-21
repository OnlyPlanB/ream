const path = require('path')
const webpack = require('webpack')
const express = require('express')
const getPort = require('get-port')
const MFS = require('memory-fs')
const createConfig = require('./create-config')

module.exports = function (app) {
  return getPort()
    .then(port => {
      const devServer = express()

      const clientConfig = createConfig(Object.assign({}, app.options, {
        type: 'client',
        dev: true,
        port
      }))
      .toConfig()

      const serverConfig = createConfig(Object.assign({}, app.options, {
        type: 'server',
        dev: true
      })).toConfig()

      let bundle
      let template

      // Dev middleware
      let clientCompiler
      let serverCompiler
      try {
        clientCompiler = webpack(clientConfig)
        serverCompiler = webpack(serverConfig)
      } catch (err) {
        if (err.name === 'WebpackOptionsValidationError') {
          console.log(err.message)
          process.exit(1) // eslint-disable-line unicorn/no-process-exit
        }
      }

      const devMiddleware = require('webpack-dev-middleware')(clientCompiler, {
        publicPath: clientConfig.output.publicPath,
        quiet: true
      })
      devServer.use(devMiddleware)

      clientCompiler.plugin('done', stats => {
        const fs = devMiddleware.fileSystem
        const filePath = path.join(clientConfig.output.path, 'index.html')
        if (fs.existsSync(filePath)) {
          template = fs.readFileSync(filePath, 'utf-8')
          if (bundle) {
            app.emit('compiled:client', {
              bundle,
              template,
              stats
            })
          }
        }
      })

      // Hot middleware
      devServer.use(require('webpack-hot-middleware')(clientCompiler, {
        log: () => {}
      }))

      // Watch and update server renderer
      const mfs = new MFS()
      serverCompiler.outputFileSystem = mfs
      serverCompiler.watch({}, (err, stats) => {
        if (err) throw err
        // Read bundle generated by vue-ssr-webpack-plugin
        const bundlePath = path.join(serverConfig.output.path, 'vue-ssr-bundle.json')
        bundle = JSON.parse(mfs.readFileSync(bundlePath, 'utf-8'))
        if (template) {
          app.emit('compiled-server', {
            bundle,
            template,
            stats
          })
        }
      })

      devServer.listen(port, '0.0.0.0')
      return {
        devServer,
        devServerPort: port
      }
    })
}