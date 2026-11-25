// Keys wait for the input method (OpenSpec composition-keys): while Japanese, Chinese
// or Korean text is being composed, Enter confirms a character, Escape cancels the
// reading and Tab or the arrows pick a candidate. A text field's keydown handler that
// acts on one of those keys returns first while composing:
//   if (composing(e)) return          // src/lib/composeKey.ts
// `composingEnter(e)` is enough for a handler that only acts on Enter.
//
// A handler is checked when it is the onKeyDown of an <input> that takes text, a
// <textarea>, <Input>, <Textarea> or a contentEditable element, or when its first
// parameter is typed KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>. Functions
// it calls with the event in the same file count as part of it.
const KEYS = new Set(['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'])
const TEXT_TAGS = new Set(['textarea', 'Input', 'Textarea'])
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
      missing: 'This keydown handler acts on {{keys}} in a text field: return first while an input method is composing (`if (composing(e)) return`, src/lib/composeKey.ts).',
    },
  },
  create(context) {
    const source = context.sourceCode
    const keysOf = (node) => source.visitorKeys[node.type] ?? []

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

    function inspect(fn, seen = new Set()) {
      const found = { keys: new Set(), guard: false, enterGuard: false }
      if (seen.has(fn) || seen.size > 6) return found
      seen.add(fn)
      const visit = (n) => {
        if (!n || typeof n.type !== 'string') return
        if (n.type === 'BinaryExpression' && ['===', '!==', '==', '!='].includes(n.operator)) {
          const k = isKeyRead(n.left) ? keyLiteral(n.right) : isKeyRead(n.right) ? keyLiteral(n.left) : null
          if (k) found.keys.add(k)
          if (n.left.type === 'MemberExpression' && n.left.property.name === 'keyCode' && n.right.value === 229) found.guard = true
        }
        if (n.type === 'SwitchStatement' && isKeyRead(n.discriminant)) {
          for (const c of n.cases) { const k = keyLiteral(c.test); if (k) found.keys.add(k) }
        }
        if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.property.name === 'includes'
          && n.callee.object.type === 'ArrayExpression' && n.arguments[0] && isKeyRead(n.arguments[0])) {
          for (const el of n.callee.object.elements) { const k = keyLiteral(el); if (k) found.keys.add(k) }
        }
        if (n.type === 'MemberExpression' && !n.computed && n.property.name === 'isComposing') found.guard = true
        if (n.type === 'CallExpression' && n.callee.type === 'Identifier') {
          if (n.callee.name === 'composing') found.guard = true
          else if (n.callee.name === 'composingEnter') found.enterGuard = true
          else {
            const callee = resolve(n.callee, n)
            if (callee && callee !== fn) {
              const sub = inspect(callee, seen)
              sub.keys.forEach((k) => found.keys.add(k))
              found.guard ||= sub.guard
              found.enterGuard ||= sub.enterGuard
            }
          }
        }
        for (const key of keysOf(n)) {
          const child = n[key]
          if (Array.isArray(child)) child.forEach(visit)
          else if (child && typeof child === 'object') visit(child)
        }
      }
      visit(fn.body)
      return found
    }

    const reported = new Set()
    function check(fn, at) {
      // A named handler is reported where it is written, so the fix lands there.
      if (fn && !isFn(at) && fn.parent?.parent !== at) at = fn
      if (!fn || reported.has(fn)) return
      const { keys, guard, enterGuard } = inspect(fn)
      if (guard || keys.size === 0) return
      if (enterGuard && [...keys].every((k) => k === 'Enter')) return
      reported.add(fn)
      context.report({ node: at, messageId: 'missing', data: { keys: [...keys].join(', ') } })
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
        if (takesText(node.parent)) check(fn, node)
        else if (fn) notText.add(fn)
      },
      'Program:exit'() {
        for (const fn of typed) if (!notText.has(fn)) check(fn, fn)
      },
    }
  },
}
