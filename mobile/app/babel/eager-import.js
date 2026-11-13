// `import('./x')` in the shared library (web/src/lib) becomes a require that answers as
// a promise. The web splits its bundle there; the app ships one bundle, where the split
// buys nothing, and Metro's development server cannot serve a split module that lives
// outside the app's folder ("Unable to resolve module ./web/src/lib/…"). The module
// still loads only when the import runs.
const path = require('node:path')

const web = path.resolve(__dirname, '../../../web') + path.sep

module.exports = function ({ types: t }) {
  return {
    name: 'opentodo-eager-import',
    visitor: {
      CallExpression(call, state) {
        if (!t.isImport(call.node.callee)) return
        if (!(state.filename ?? '').startsWith(web)) return
        const required = t.callExpression(t.identifier('require'), call.node.arguments)
        call.replaceWith(
          t.callExpression(t.memberExpression(t.callExpression(t.memberExpression(t.identifier('Promise'), t.identifier('resolve')), []), t.identifier('then')), [
            t.arrowFunctionExpression([], required),
          ]),
        )
      },
    },
  }
}
