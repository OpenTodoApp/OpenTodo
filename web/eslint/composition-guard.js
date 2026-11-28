// Keys wait for the input method (OpenSpec composition-keys): while Japanese, Chinese
// or Korean text is being composed, Enter confirms a character, Escape cancels the
// reading and Tab or the arrows pick a candidate. A text field's keydown handler that
// acts on one of those keys returns first while composing:
//   if (composing(e)) return          // src/lib/composeKey.ts
// `composingEnter(e)` is enough for a handler that only acts on Enter.
//
// The guard comes before the first key test. A handler is checked when it is the
// onKeyDown of an <input> that takes text, a <textarea>, <Input>, <Textarea>,
// <NumberInput> or a contentEditable element, or of an element that renders one inside
// it (the keys bubble to it), or when its first parameter is typed
// KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>. Functions it calls in the same
// file count as part of it.
const KEYS = new Set(['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'])
const TEXT_TAGS = new Set(['textarea', 'Input', 'Textarea', 'NumberInput'])
const NOT_TEXT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image', 'hidden'])
const TEXT_ELEMENTS = new Set(['HTMLInputElement', 'HTMLTextAreaElement'])
const HANDLERS = new Set(['onKeyDown', 'onKeyDownCapture'])
const isFn = (n) => n && (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression' || n.type === 'FunctionDeclaration')
const isKeyRead = (n) => (n.type === 'MemberExpression' && !n.computed && n.property.name === 'key') || (n.type === 'Identifier' && n.name === 'key')
const keyLiteral = (n) => n && n.type === 'Literal' && typeof n.value === 'string' && KEYS.has(n.value) ? n.value : null

function attr(node, name) {
  return node.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === name)
}

function takesText(opening) {
  const n = opening.name
  if (n.type !== 'JSXIdentifier') return false
  const editable = attr(opening, 'contentEditable')
  if (editable && !(editable.value?.type === 'JSXExpressionContainer' && editable.value.expression.type === 'Literal' && editable.value.expression.value === false)) return true
  if (TEXT_TAGS.has(n.name)) return true
  if (n.name !== 'input') return false
  const type = attr(opening, 'type')
  return !(type?.value?.type === 'Literal' && NOT_TEXT.has(type.value.value))
}

function typedForText(fn) {
  const t = fn.params[0]?.typeAnnotation?.typeAnnotation
  if (t?.type !== 'TSTypeReference') return false
  const name = t.typeName.type === 'TSQualifiedName' ? t.typeName.right.name : t.typeName.name
  if (!/KeyboardEvent$/.test(name)) return false
  const args = (t.typeArguments ?? t.typeParameters)?.params ?? []
  const names = args.flatMap((a) => (a.type === 'TSUnionType' ? a.types : [a]))
  return names.some((a) => a.type === 'TSTypeReference' && TEXT_ELEMENTS.has(a.typeName.name))
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'A text field acting on Enter, Escape, Tab or an arrow key returns first while an input method is composing.' },
    schema: [],
    messages: {
      missing: 'This keydown handler acts on {{keys}} in a text field: return first while an input method is composing (`if (composing(e)) return`, src/lib/composeKey.ts), before any key test.',
    },
  },
  create(context) {
    const source = context.sourceCode
    const keysOf = (node) => source.visitorKeys[node.type] ?? []
    const walk = (n, fn) => {
      if (!n || typeof n.type !== 'string' || fn(n) === false) return
      for (const key of keysOf(n)) {
        const child = n[key]
        if (Array.isArray(child)) child.forEach((c) => walk(c, fn))
        else if (child && typeof child === 'object') walk(child, fn)
      }
    }

    function resolve(node, scopeNode) {
      if (isFn(node)) return node
      if (node?.type !== 'Identifier') return null
      let scope = source.getScope(scopeNode)
      while (scope) {
        const v = scope.set.get(node.name)
        if (v) {
          const d = v.defs[0]
          const def = d?.node
          if (d?.type === 'FunctionName') return def
          if (d?.type === 'Variable') {
            const init = def.init
            if (isFn(init)) return init
            // useCallback(fn, deps)
            if (init?.type === 'CallExpression' && isFn(init.arguments[0])) return init.arguments[0]
          }
          return null
        }
        scope = scope.upper
      }
      return null
    }

    // What a handler does with keys: the keys it acts on, and whether a composition
    // guard comes before the first of them (`safe`). A function it calls that is not
    // safe on its own counts as a key test where it is called.
    const memo = new Map()
    function inspect(fn) {
      if (memo.has(fn)) return memo.get(fn) ?? { keys: new Set(), safe: true }
      memo.set(fn, null) // a cycle reads as nothing
      const keys = new Set()
      let firstKey = Infinity, firstGuard = Infinity, enterGuard = false
      const keyAt = (n, k) => { keys.add(k); firstKey = Math.min(firstKey, n.range[0]) }
      const guardAt = (n) => { firstGuard = Math.min(firstGuard, n.range[0]) }
      walk(fn.body, (n) => {
        if (n.type === 'BinaryExpression' && ['===', '!==', '==', '!='].includes(n.operator)) {
          const k = isKeyRead(n.left) ? keyLiteral(n.right) : isKeyRead(n.right) ? keyLiteral(n.left) : null
          if (k) keyAt(n, k)
          if (n.left.type === 'MemberExpression' && n.left.property.name === 'keyCode' && n.right.value === 229) guardAt(n)
        }
        if (n.type === 'SwitchStatement' && isKeyRead(n.discriminant)) {
          for (const c of n.cases) { const k = keyLiteral(c.test); if (k) keyAt(n, k) }
        }
        if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.property.name === 'includes'
          && n.callee.object.type === 'ArrayExpression' && n.arguments[0] && isKeyRead(n.arguments[0])) {
          for (const el of n.callee.object.elements) { const k = keyLiteral(el); if (k) keyAt(n, k) }
        }
        if (n.type === 'MemberExpression' && !n.computed && n.property.name === 'isComposing') guardAt(n)
        if (n.type === 'CallExpression' && n.callee.type === 'Identifier') {
          if (n.callee.name === 'composing') guardAt(n)
          // composingEnter tests the key itself, so it may come after the Enter test.
          else if (n.callee.name === 'composingEnter') enterGuard = true
          else {
            const callee = resolve(n.callee, n)
            if (callee && callee !== fn) {
              const sub = inspect(callee)
              if (!sub.safe) sub.keys.forEach((k) => keyAt(n, k))
            }
          }
        }
      })
      const safe = keys.size === 0 || firstGuard < firstKey || (enterGuard && [...keys].every((k) => k === 'Enter'))
      const result = { keys, safe }
      memo.set(fn, result)
      return result
    }

    const reported = new Set()
    function check(fn, at) {
      // A named handler is reported where it is written, so the fix lands there.
      if (fn && !isFn(at) && fn.parent?.parent !== at) at = fn
      if (!fn || reported.has(fn)) return
      const { keys, safe } = inspect(fn)
      if (safe) return
      reported.add(fn)
      context.report({ node: at, messageId: 'missing', data: { keys: [...keys].join(', ') } })
    }

    // An element that renders a text field inside it gets that field's keys as they bubble.
    function holdsText(element) {
      let found = false
      for (const child of element?.children ?? []) {
        walk(child, (n) => {
          if (found) return false
          if (n.type === 'JSXOpeningElement' && takesText(n)) found = true
        })
      }
      return found
    }

    // A typed handler that turns out to belong to a range or a button is not a text field's.
    const typed = []
    const notText = new Set()
    const fns = (node) => { if (typedForText(node)) typed.push(node) }
    return {
      FunctionDeclaration: fns,
      FunctionExpression: fns,
      ArrowFunctionExpression: fns,
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || !HANDLERS.has(node.name.name)) return
        if (node.value?.type !== 'JSXExpressionContainer') return
        const fn = resolve(node.value.expression, node)
        if (takesText(node.parent) || holdsText(node.parent.parent)) check(fn, node)
        else if (fn) notText.add(fn)
      },
      'Program:exit'() {
        for (const fn of typed) if (!notText.has(fn)) check(fn, fn)
      },
    }
  },
}
