// A strict parser for the YAML that the TrueNAS app files (deploy/truenas/) and the
// Easypanel meta.yaml (deploy/easypanel/) use, OpenSpec change platform-catalogs.
// Supported: block maps (plain or quoted keys), block sequences (also of maps, and
// "key:" followed by a sequence at the same indent), plain, single- and double-quoted
// scalars, plain scalars folded over several lines, | and > block scalars, flow
// sequences ([a, "b", [c]]), the empty map {}, and comments. Anything else (anchors,
// tags, flow maps, tabs, duplicate keys, odd indentation) throws with a line number,
// so a file the checker reads is a file it understood.

const PLAIN_KEY = /^([A-Za-z0-9_$][A-Za-z0-9_$./-]*|"[^"\\]*"|'[^']*'):(?:[ ]+(.*))?$/

function stripComment(s) {
  let quote = null
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quote) {
      if (c === '\\' && quote === '"') i++
      else if (c === quote) quote = null
    } else if (c === '"' || c === "'") {
      if (i === 0 || /[\s[,:-]/.test(s[i - 1])) quote = c
    } else if (c === '#' && (i === 0 || s[i - 1] === ' ')) {
      return s.slice(0, i).trimEnd()
    }
  }
  return s.trimEnd()
}

/** One scalar or flow sequence written on one line. */
export function parseScalar(s, no = 0) {
  const fail = (m) => { throw new Error(`line ${no}: ${m}: ${s}`) }
  if (s.startsWith('"')) {
    if (!/^"(?:[^"\\]|\\.)*"$/.test(s)) fail('unterminated or trailing text after a double-quoted string')
    try { return JSON.parse(s) } catch { fail('unsupported escape in a double-quoted string') }
  }
  if (s.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/.test(s)) fail('unterminated or trailing text after a single-quoted string')
    return s.slice(1, -1).replace(/''/g, "'")
  }
  if (s.startsWith('[')) {
    let pos = 0
    const flow = () => {
      if (s[pos] !== '[') fail('expected [')
      pos++
      const out = []
      const ws = () => { while (s[pos] === ' ') pos++ }
      ws()
      if (s[pos] === ']') { pos++; return out }
      for (;;) {
        ws()
        if (s[pos] === '[') out.push(flow())
        else {
          const m = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^,[\]{}]+)/.exec(s.slice(pos))
          if (!m) fail('unsupported flow sequence item')
          pos += m[0].length
          out.push(parseScalar(m[0].trim(), no))
        }
        ws()
        if (s[pos] === ',') { pos++; continue }
        if (s[pos] === ']') { pos++; return out }
        fail('expected , or ] in a flow sequence')
      }
    }
    const v = flow()
    if (pos !== s.length) fail('trailing text after a flow sequence')
    return v
  }
  if (s === '{}') return {}
  if (/^[{&*!|>%@`]/.test(s)) fail('unsupported YAML (flow maps, anchors, aliases, tags)')
  if (/: |:$/.test(s)) fail('a plain scalar cannot contain ": "')
  if (s === 'true') return true
  if (s === 'false') return false
  if (s === 'null' || s === '~') return null
  if (/^-?(0|[1-9]\d*)$/.test(s)) return Number(s)
  if (/^-?(0|[1-9]\d*)\.\d+$/.test(s)) return Number(s)
  return s
}

export function parseYaml(text) {
  const raw = text.split('\n')
  raw.forEach((l, i) => {
    if (l.includes('\t')) throw new Error(`line ${i + 1}: tabs are not allowed`)
    if (l.includes('\r')) throw new Error(`line ${i + 1}: use \\n line endings`)
  })
  const blank = (l) => l.trim() === '' || l.trim().startsWith('#')
  const indentOf = (l) => l.length - l.trimStart().length
  let i = 0
  const skip = () => { while (i < raw.length && blank(raw[i])) i++ }
  const peek = () => { skip(); return i < raw.length ? { indent: indentOf(raw[i]), text: stripComment(raw[i].trim()), no: i + 1 } : null }
  const isItem = (t) => t === '-' || t.startsWith('- ')

  function node(indent) {
    const p = peek()
    return isItem(p.text) ? seq(indent) : map(indent)
  }

  function seq(indent) {
    const out = []
    for (let p = peek(); p && p.indent === indent && isItem(p.text); p = peek()) {
      if (p.text === '-') {
        i++
        const n = peek()
        if (!n || n.indent <= indent) throw new Error(`line ${p.no}: empty sequence item`)
        out.push(node(n.indent))
        continue
      }
      const rest = p.text.slice(1).trimStart()
      const col = indent + (p.text.length - rest.length)
      if (PLAIN_KEY.test(rest)) {
        raw[i] = ' '.repeat(col) + rest // the item is a map starting at the item's column
        out.push(map(col))
      } else {
        i++
        out.push(value(rest, p.no, indent))
      }
    }
    return out
  }

  function map(indent) {
    const out = {}
    for (let p = peek(); p && p.indent === indent && !isItem(p.text); p = peek()) {
      const m = PLAIN_KEY.exec(p.text)
      if (!m) throw new Error(`line ${p.no}: expected "key:" or "key: value", got: ${p.text}`)
      const key = /^["']/.test(m[1]) ? m[1].slice(1, -1) : m[1]
      if (Object.hasOwn(out, key)) throw new Error(`line ${p.no}: duplicate key ${key}`)
      i++
      const v = m[2] ?? ''
      if (v === '') {
        const n = peek()
        if (n && n.indent > indent && !isItem(n.text) && !PLAIN_KEY.test(n.text)) {
          i++
          out[key] = /^["'[{]/.test(n.text) ? parseScalar(n.text, n.no) : value(n.text, n.no, indent, true)
        } else if (n && n.indent > indent) out[key] = node(n.indent)
        else if (n && n.indent === indent && isItem(n.text)) out[key] = seq(indent)
        else out[key] = null
      } else if (/^[|>][-+]?$/.test(v)) {
        out[key] = blockScalar(v, indent)
      } else {
        out[key] = value(v, p.no, indent)
      }
      const n = peek()
      if (n && n.indent > indent) throw new Error(`line ${n.no}: unexpected indentation`)
    }
    return out
  }

  /** A scalar, folding the more-indented plain lines that follow it. */
  function value(v, no, indent, forcePlain = false) {
    if (/^["'[{]/.test(v)) return parseScalar(v, no)
    if (forcePlain && /: |:$| #/.test(v)) throw new Error(`line ${no}: a plain scalar cannot contain ": " or " #"`)
    let out = v
    let more = false
    for (;;) {
      const from = i
      const n = peek()
      if (!n || n.indent <= indent || isItem(n.text) || PLAIN_KEY.test(n.text)) { i = from; break }
      if (/: |:$| #/.test(n.text)) throw new Error(`line ${n.no}: a plain scalar cannot contain ": " or " #"`)
      if (raw.slice(from, i).some((l) => l.trim().startsWith('#'))) throw new Error(`line ${n.no}: comment inside a plain scalar`)
      const empties = i - from
      out += empties ? '\n'.repeat(empties) + n.text : ' ' + n.text
      more = true
      i++
    }
    return more ? out : parseScalar(v, no)
  }

  function blockScalar(style, indent) {
    const lines = []
    let blockIndent = null
    while (i < raw.length) {
      const l = raw[i]
      if (l.trim() === '') { lines.push(''); i++; continue }
      const ind = indentOf(l)
      if (ind <= indent) break
      if (blockIndent === null) blockIndent = ind
      if (ind < blockIndent) throw new Error(`line ${i + 1}: block scalar line is less indented than its first line`)
      lines.push(l.slice(blockIndent))
      i++
    }
    while (lines.length && lines.at(-1) === '') lines.pop()
    const body = style[0] === '|' ? lines.join('\n') : lines.join(' ').replace(/ ?\n ?/g, '\n')
    return style.endsWith('-') ? body : body + '\n'
  }

  const first = peek()
  if (!first) return {}
  if (first.indent !== 0) throw new Error(`line ${first.no}: document must start at column 0`)
  const doc = node(0)
  const left = peek()
  if (left) throw new Error(`line ${left.no}: could not parse (check the indentation)`)
  return doc
}
