// The two Vite build-time forms the shared library uses (web/src/lib), compiled for
// Metro and Jest, which have neither (OpenSpec change native-app-foundation D2):
//
//   import.meta.glob(patterns, { import?: 'default' })  →  { './x.json': () => Promise.resolve(module) }
//   import.meta.env.MODE                                →  process.env.NODE_ENV
//
// The files are listed when the module is compiled, as Vite does. Patterns are
// string literals relative to the module, `*` within one folder, a leading `!`
// excludes. Anything else is a build error naming the module, never a silent miss.
const fs = require('node:fs')
const path = require('node:path')

function globFiles(dir, patterns, where) {
  const include = []
  const exclude = new Set()
  for (const p of patterns) {
    const neg = p.startsWith('!')
    const rel = neg ? p.slice(1) : p
    if (!rel.startsWith('./') && !rel.startsWith('../')) throw new Error(`${where}: import.meta.glob pattern ${p} must be relative`)
    const folder = path.dirname(rel)
    const base = path.basename(rel)
    if (folder.includes('*')) throw new Error(`${where}: import.meta.glob pattern ${p}: only the file name may hold *`)
    const re = new RegExp('^' + base.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$')
    const abs = path.join(dir, folder)
    const names = fs.existsSync(abs) ? fs.readdirSync(abs).filter((n) => re.test(n)).sort() : []
    for (const n of names) (neg ? exclude.add.bind(exclude) : include.push.bind(include))(`${folder}/${n}`)
  }
  return include.filter((f) => !exclude.has(f))
}

function viteImportMeta({ types: t }) {
  const isImportMeta = (node) => t.isMetaProperty(node) && node.meta.name === 'import' && node.property.name === 'meta'
  return {
    name: 'opentodo-vite-import-meta',
    visitor: {
      CallExpression(p, state) {
        const callee = p.node.callee
        if (!t.isMemberExpression(callee) || !isImportMeta(callee.object) || !t.isIdentifier(callee.property, { name: 'glob' })) return
        const where = state.filename ?? 'unknown module'
        const [arg, opts] = p.node.arguments
        const list = t.isStringLiteral(arg) ? [arg] : t.isArrayExpression(arg) ? arg.elements : null
        if (!list || !list.every((e) => t.isStringLiteral(e))) throw p.buildCodeFrameError('import.meta.glob takes string literals')
        let pick = null
        if (opts) {
          if (!t.isObjectExpression(opts)) throw p.buildCodeFrameError('import.meta.glob options must be an object literal')
          for (const prop of opts.properties) {
            const key = t.isIdentifier(prop.key) ? prop.key.name : prop.key.value
            if (key === 'import' && t.isStringLiteral(prop.value)) pick = prop.value.value
            else throw p.buildCodeFrameError(`import.meta.glob option ${key} is not supported in the app`)
          }
        }
        const files = globFiles(path.dirname(where), list.map((e) => e.value), where)
        // () => Promise.resolve(<module>), the module as an ES namespace ({ default } for JSON).
        const load = (file) => {
          const req = t.callExpression(t.identifier('require'), [t.stringLiteral(file)])
          const ns = t.callExpression(
            t.arrowFunctionExpression([t.identifier('m')], t.conditionalExpression(
              t.logicalExpression('&&', t.identifier('m'), t.memberExpression(t.identifier('m'), t.identifier('__esModule'))),
              t.identifier('m'),
              t.objectExpression([t.objectProperty(t.identifier('default'), t.identifier('m'))]),
            )),
            [req],
          )
          const value = pick ? t.memberExpression(ns, t.stringLiteral(pick), true) : ns
          return t.arrowFunctionExpression([], t.callExpression(t.memberExpression(t.identifier('Promise'), t.identifier('resolve')), [value]))
        }
        p.replaceWith(t.objectExpression(files.map((f) => t.objectProperty(t.stringLiteral(f), load(f)))))
      },
      MemberExpression(p) {
        const n = p.node
        if (!t.isMemberExpression(n.object) || !isImportMeta(n.object.object) || !t.isIdentifier(n.object.property, { name: 'env' })) return
        if (t.isIdentifier(n.property, { name: 'MODE' })) {
          p.replaceWith(t.memberExpression(t.memberExpression(t.identifier('process'), t.identifier('env')), t.identifier('NODE_ENV')))
        }
      },
    },
  }
}

module.exports = viteImportMeta
// Shared with scripts/shared-modules.mjs, which lists the files a glob reaches.
module.exports.globFiles = globFiles
