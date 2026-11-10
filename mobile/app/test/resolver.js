// A package named by a shared module (web/src/lib) resolves from this app's
// node_modules, like Metro's disableHierarchicalLookup: one React, and no need for
// web's install.
const path = require('node:path')

const web = path.resolve(__dirname, '../../../web') + path.sep
const app = path.resolve(__dirname, '..')

module.exports = (request, options) => {
  const bare = !request.startsWith('.') && !path.isAbsolute(request)
  if (bare && options.basedir.startsWith(web)) return options.defaultResolver(request, { ...options, basedir: app })
  return options.defaultResolver(request, options)
}
