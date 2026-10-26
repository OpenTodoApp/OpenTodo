// Tests wait for a condition, never for a fixed time (OpenSpec
// web-lint-and-test-hygiene, test audit F2): `await flush(40)` followed by an
// assertion passes on an idle laptop and fails on a loaded CI runner. Use
// `waitFor(() => condition, 'what')` from ui/test-utils instead; `flush()` (one
// turn of the event loop inside act) stays allowed.
//
// Reported in test files:
//   flush(<n>)                         with a number other than 0
//   sleep(<n>) / delay(<n>) / wait(<n>)
//   new Promise((r) => setTimeout(r, <n>)) with a delay other than 0
//
// The rare wait that is the behaviour under test (a type-ahead buffer that
// resets after 500 ms with real timers) keeps a reasoned suppression:
//   // eslint-disable-next-line test-hygiene/no-fixed-wait -- type-ahead resets after 500 ms
const SLEEPS = new Set(['flush', 'sleep', 'delay', 'wait'])

const zero = (node) => !node || (node.type === 'Literal' && node.value === 0)

function insidePromiseExecutor(node, resolver) {
  for (let fn = node.parent; fn; fn = fn.parent) {
    if (fn.type !== 'ArrowFunctionExpression' && fn.type !== 'FunctionExpression') continue
    const p = fn.parent
    if (p?.type === 'NewExpression' && p.callee.type === 'Identifier' && p.callee.name === 'Promise' && p.arguments[0] === fn) {
      return fn.params[0]?.type === 'Identifier' && fn.params[0].name === resolver
    }
  }
  return false
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Wait for a condition (waitFor) instead of a fixed time in tests.' },
    schema: [],
    messages: {
      fixed: 'A fixed wait ({{what}}) races a loaded machine: wait for the condition with waitFor(() => ..., "what") from ui/test-utils.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee
        if (callee.type !== 'Identifier') return
        if (SLEEPS.has(callee.name)) {
          const [ms] = node.arguments
          if (ms && ms.type === 'Literal' && typeof ms.value === 'number' && ms.value !== 0) {
            context.report({ node, messageId: 'fixed', data: { what: `${callee.name}(${ms.raw})` } })
          }
          return
        }
        if (callee.name === 'setTimeout') {
          const [fn, ms] = node.arguments
          if (zero(ms) || !fn) return
          // setTimeout(r, n) or setTimeout(() => r(), n)
          const resolver = fn.type === 'Identifier' ? fn.name
            : fn.type === 'ArrowFunctionExpression' && fn.body.type === 'CallExpression' && fn.body.callee.type === 'Identifier' ? fn.body.callee.name : null
          if (resolver && insidePromiseExecutor(node, resolver)) {
            context.report({ node, messageId: 'fixed', data: { what: 'a promise around setTimeout' } })
          }
        }
      },
    }
  },
}
