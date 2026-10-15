// The message formatter of the interface translations (OpenSpec `app-localization`,
// design D2): a subset of ICU MessageFormat, small enough to read in one sitting.
//
//   {name}                                    a value
//   {n, plural, =0 {none} one {# task} other {# tasks}}   Intl.PluralRules categories, # is n
//   {kind, select, task {…} project {…} other {…}}
//   <b>bold</b>                               a tag, rendered by t.rich()
//   '{'  ''                                   a literal brace, a literal apostrophe
//
// Pure: no React, no catalog. Messages are parsed once and cached.

export type Node =
  | { t: 'text'; v: string }
  | { t: 'arg'; name: string }
  | { t: 'pound' }
  | { t: 'plural'; name: string; options: Record<string, Node[]> }
  | { t: 'select'; name: string; options: Record<string, Node[]> }
  | { t: 'tag'; name: string; children: Node[] }

/** One piece of a formatted message: text, or a tag around more pieces. */
export type Part = string | { tag: string; children: Part[] }

export type Values = Record<string, string | number | boolean | null | undefined>

export class MessageError extends Error {}

const NAME = /^[A-Za-z_][\w]*$/
const TAG = /^[a-z][a-z0-9]*$/

/** Parses a message; throws MessageError for malformed input (unbalanced braces, unknown argument types). */
export function parse(message: string): Node[] {
  let i = 0
  const s = message

  function nodes(inPlural: boolean, closeTag?: string): Node[] {
    const out: Node[] = []
    let text = ''
    const flush = () => {
      if (text) out.push({ t: 'text', v: text })
      text = ''
    }
    while (i < s.length) {
      const c = s[i]
      if (c === "'") {
        // '' is an apostrophe; '{…}' quotes syntax characters until the next apostrophe.
        if (s[i + 1] === "'") {
          text += "'"
          i += 2
          continue
        }
        if (s[i + 1] === '{' || s[i + 1] === '}' || s[i + 1] === '#' || s[i + 1] === '<') {
          const end = s.indexOf("'", i + 1)
          if (end < 0) throw new MessageError('unterminated quote')
          text += s.slice(i + 1, end)
          i = end + 1
          continue
        }
        text += c
        i++
        continue
      }
      if (c === '}') {
        flush()
        return out
      }
      if (c === '{') {
        flush()
        i++
        out.push(argument())
        continue
      }
      if (c === '#' && inPlural) {
        flush()
        out.push({ t: 'pound' })
        i++
        continue
      }
      if (c === '<') {
        const m = /^<(\/?)([a-z][a-z0-9]*)>/.exec(s.slice(i))
        if (m && m[1] === '/' && m[2] === closeTag) {
          flush()
          i += m[0].length
          return out
        }
        if (m && !m[1] && TAG.test(m[2]) && s.includes(`</${m[2]}>`, i)) {
          flush()
          i += m[0].length
          out.push({ t: 'tag', name: m[2], children: nodes(inPlural, m[2]) })
          continue
        }
      }
      text += c
      i++
    }
    if (closeTag) throw new MessageError(`unclosed <${closeTag}>`)
    flush()
    return out
  }

  function skipSpace() {
    while (i < s.length && /\s/.test(s[i])) i++
  }

  function word(): string {
    skipSpace()
    const start = i
    while (i < s.length && /[^\s,{}]/.test(s[i])) i++
    return s.slice(start, i)
  }

  function argument(): Node {
    const name = word()
    if (!NAME.test(name)) throw new MessageError(`bad argument name "${name}"`)
    skipSpace()
    if (s[i] === '}') {
      i++
      return { t: 'arg', name }
    }
    if (s[i] !== ',') throw new MessageError(`expected , or } after ${name}`)
    i++
    const type = word()
    skipSpace()
    if (type !== 'plural' && type !== 'select') throw new MessageError(`unknown argument type "${type}"`)
    if (s[i] !== ',') throw new MessageError(`expected , after ${type}`)
    i++
    const options: Record<string, Node[]> = {}
    for (;;) {
      skipSpace()
      if (s[i] === '}') {
        i++
        break
      }
      const key = word()
      if (!key) throw new MessageError(`expected an option in ${name}`)
      skipSpace()
      if (s[i] !== '{') throw new MessageError(`expected { after option ${key}`)
      i++
      options[key] = nodes(type === 'plural')
      if (s[i] !== '}') throw new MessageError(`unclosed option ${key}`)
      i++
    }
    if (!options.other) throw new MessageError(`${name} has no "other" option`)
    return type === 'plural' ? { t: 'plural', name, options } : { t: 'select', name, options }
  }

  const out = nodes(false)
  // nodes() stops early only at a stray }.
  if (i < s.length) throw new MessageError('unbalanced }')
  return out
}

const cache = new Map<string, Node[] | null>()

function cached(message: string): Node[] | null {
  let n = cache.get(message)
  if (n === undefined) {
    try {
      n = parse(message)
    } catch {
      n = null
    }
    if (cache.size > 5000) cache.clear()
    cache.set(message, n)
  }
  return n
}

const rules = new Map<string, Intl.PluralRules>()
const numbers = new Map<string, Intl.NumberFormat>()

function pluralRules(locale: string): Intl.PluralRules {
  let r = rules.get(locale)
  if (!r) rules.set(locale, (r = new Intl.PluralRules(locale)))
  return r
}

/** A number in the locale's notation. */
export function formatNumber(n: number, locale: string): string {
  let f = numbers.get(locale)
  if (!f) numbers.set(locale, (f = new Intl.NumberFormat(locale)))
  return f.format(n)
}

function walk(nodes: Node[], values: Values, locale: string, count: number | null, out: Part[]) {
  for (const n of nodes) {
    switch (n.t) {
      case 'text':
        out.push(n.v)
        break
      case 'arg': {
        const v = values[n.name]
        out.push(v === undefined || v === null ? `{${n.name}}` : typeof v === 'number' ? formatNumber(v, locale) : String(v))
        break
      }
      case 'pound':
        out.push(count === null ? '#' : formatNumber(count, locale))
        break
      case 'plural': {
        const v = Number(values[n.name] ?? 0)
        const exact = n.options[`=${v}`]
        const branch = exact ?? n.options[pluralRules(locale).select(v)] ?? n.options.other
        walk(branch, values, locale, v, out)
        break
      }
      case 'select': {
        const v = String(values[n.name] ?? '')
        walk(n.options[v] ?? n.options.other, values, locale, count, out)
        break
      }
      case 'tag': {
        const children: Part[] = []
        walk(n.children, values, locale, count, children)
        out.push({ tag: n.name, children: merge(children) })
        break
      }
    }
  }
}

function merge(parts: Part[]): Part[] {
  const out: Part[] = []
  for (const p of parts) {
    if (typeof p === 'string' && typeof out[out.length - 1] === 'string') out[out.length - 1] += p
    else out.push(p)
  }
  return out
}

/** Formats a message into parts (tags kept). A malformed message is returned as its source text. */
export function formatParts(message: string, values: Values = {}, locale = 'en'): Part[] {
  const nodes = cached(message)
  if (!nodes) return [message]
  const out: Part[] = []
  walk(nodes, values, locale, null, out)
  return merge(out)
}

/** The plain text of parts: tags are dropped, their content kept. */
export function plainText(parts: Part[]): string {
  return parts.map((p) => (typeof p === 'string' ? p : plainText(p.children))).join('')
}

/** Formats a message to plain text. */
export function formatMessage(message: string, values: Values = {}, locale = 'en'): string {
  return plainText(formatParts(message, values, locale))
}

/** The placeholder names and plural/select categories a message uses (for the catalog check). */
export function signature(message: string): { args: string[]; categories: Record<string, string[]>; tags: string[] } {
  const args = new Set<string>()
  const tags = new Set<string>()
  const categories: Record<string, string[]> = {}
  const visit = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.t === 'arg') args.add(n.name)
      if (n.t === 'tag') {
        tags.add(n.name)
        visit(n.children)
      }
      if (n.t === 'plural' || n.t === 'select') {
        args.add(n.name)
        if (n.t === 'select') categories[n.name] = Object.keys(n.options).sort()
        for (const o of Object.values(n.options)) visit(o)
      }
    }
  }
  visit(parse(message))
  return { args: [...args].sort(), categories, tags: [...tags].sort() }
}
