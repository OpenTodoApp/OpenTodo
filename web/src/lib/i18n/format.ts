// Message formatter (OpenSpec change app-localization, design D2): a small subset
// of ICU MessageFormat, written by hand so the app needs no library.
//
//   {name}                                  a placeholder (numbers as written: ports, years)
//   {n, number}                             a number with the language's digit grouping
//   {n, plural, =0 {none} one {# task} other {# tasks}}
//   {kind, select, task {Task} other {Item}}
//   <b>bold</b>                             a tag, rendered by t.rich()
//
// Apostrophes quote only before a brace or `#` ("'{'" is a literal brace), so
// "don't" needs no escaping. Plural categories come from Intl.PluralRules and `#`
// is written with the language's digit grouping.

export type Part =
  | { k: 'text'; v: string }
  | { k: 'arg'; name: string; number?: boolean }
  | { k: 'hash' }
  | { k: 'plural'; name: string; offset: number; options: Record<string, Part[]> }
  | { k: 'select'; name: string; options: Record<string, Part[]> }
  | { k: 'tag'; name: string; children: Part[] }

export class MessageSyntaxError extends Error {}

/** Parses a message into parts; throws MessageSyntaxError on malformed input. */
export function parseMessage(src: string): Part[] {
  let i = 0
  const fail = (why: string): never => { throw new MessageSyntaxError(`${why} at ${i} in "${src}"`) }
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++ }
  const ident = () => {
    const m = /^[\p{L}\p{N}_$.-]+/u.exec(src.slice(i))
    if (!m) fail('expected a name')
    i += m![0].length
    return m![0]
  }

  // inPlural: `#` is special; closeTag: the tag whose end ends this run.
  function parts(inPlural: boolean, until: '}' | 'end' | string): Part[] {
    const out: Part[] = []
    let text = ''
    const flush = () => { if (text) { out.push({ k: 'text', v: text }); text = '' } }
    while (i < src.length) {
      const c = src[i]
      if (c === "'") {
        const n = src[i + 1]
        if (n === "'") { text += "'"; i += 2; continue }
        if (n === '{' || n === '}' || (inPlural && n === '#') || n === '<') {
          const end = src.indexOf("'", i + 1)
          if (end < 0) { text += src.slice(i + 1); i = src.length; break }
          text += src.slice(i + 1, end); i = end + 1; continue
        }
        text += c; i++; continue
      }
      if (c === '}') {
        if (until === '}') { flush(); return out }
        fail('unexpected "}"')
      }
      if (c === '#' && inPlural) { flush(); out.push({ k: 'hash' }); i++; continue }
      if (c === '<' && /^<\/?[a-zA-Z][\w-]*>/.test(src.slice(i))) {
        if (src[i + 1] === '/') {
          const name = /^<\/([a-zA-Z][\w-]*)>/.exec(src.slice(i))![1]
          if (until !== `</${name}>`) fail(`unexpected </${name}>`)
          i += name.length + 3; flush(); return out
        }
        const name = /^<([a-zA-Z][\w-]*)>/.exec(src.slice(i))![1]
        flush(); i += name.length + 2
        out.push({ k: 'tag', name, children: parts(inPlural, `</${name}>`) })
        continue
      }
      if (c === '{') { flush(); i++; out.push(argument(inPlural)); continue }
      text += c; i++
    }
    if (until !== 'end') fail(until === '}' ? 'missing "}"' : `missing ${until}`)
    flush()
    return out
  }

  function options(inPlural: boolean): Record<string, Part[]> {
    const opts: Record<string, Part[]> = {}
    ws()
    while (src[i] !== '}') {
      if (i >= src.length) fail('missing "}"')
      const key = src[i] === '=' ? (i++, '=' + ident()) : ident()
      ws()
      if (src[i] !== '{') fail(`expected "{" after ${key}`)
      i++
      opts[key] = parts(inPlural, '}')
      i++
      ws()
    }
    if (!('other' in opts)) fail('missing "other"')
    return opts
  }

  function argument(inPlural: boolean): Part {
    ws()
    const name = ident()
    ws()
    if (src[i] === '}') { i++; return { k: 'arg', name } }
    if (src[i] !== ',') fail('expected "," or "}"')
    i++; ws()
    const type = ident()
    ws()
    if (type === 'number') {
      if (src[i] !== '}') fail('expected "}"')
      i++
      return { k: 'arg', name, number: true }
    }
    if (src[i] !== ',') fail('expected ","')
    i++; ws()
    if (type === 'plural') {
      let offset = 0
      const m = /^offset:\s*(\d+)/.exec(src.slice(i))
      if (m) { offset = Number(m[1]); i += m[0].length }
      const opts = options(true)
      i++
      return { k: 'plural', name, offset, options: opts }
    }
    if (type === 'select') {
      const opts = options(inPlural)
      i++
      return { k: 'select', name, options: opts }
    }
    return fail(`unknown type "${type}"`)
  }

  const out = parts(false, 'end')
  return out
}

const parsed = new Map<string, Part[]>()

/** The parsed form, cached per message. A malformed message renders as its raw text. */
export function compile(message: string): Part[] {
  let p = parsed.get(message)
  if (!p) {
    try { p = parseMessage(message) } catch { p = [{ k: 'text', v: message }] }
    parsed.set(message, p)
  }
  return p
}

const pluralRules = new Map<string, Intl.PluralRules>()
function pluralCategory(locale: string, n: number): string {
  let r = pluralRules.get(locale)
  if (!r) { r = new Intl.PluralRules(locale); pluralRules.set(locale, r) }
  return r.select(n)
}

const numberFormats = new Map<string, Intl.NumberFormat>()
/** A number with the locale's digit grouping. */
export function formatNumberIn(locale: string, n: number): string {
  let f = numberFormats.get(locale)
  if (!f) { f = new Intl.NumberFormat(locale); numberFormats.set(locale, f) }
  return f.format(n)
}

export type Values = Record<string, unknown>
export type TagFn<R> = (children: R[]) => R

/**
 * Formats parsed parts. `wrap` renders a tag (rich messages); without it a tag's
 * children are written as plain text. Values that are not strings or numbers are
 * passed through, so a rich message can carry elements.
 */
export function render<R = string>(parts: Part[], values: Values, locale: string, tags?: Record<string, TagFn<R | string>>, hash?: number): (R | string)[] {
  const out: (R | string)[] = []
  const push = (v: R | string) => {
    if (typeof v === 'string' && typeof out[out.length - 1] === 'string') out[out.length - 1] = (out[out.length - 1] as string) + v
    else out.push(v)
  }
  for (const p of parts) {
    switch (p.k) {
      case 'text': push(p.v); break
      case 'hash': push(hash === undefined ? '#' : formatNumberIn(locale, hash)); break
      case 'arg': {
        const v = values[p.name]
        if (v === undefined || v === null) push(`{${p.name}}`)
        else if (typeof v === 'number') push(p.number ? formatNumberIn(locale, v) : String(v))
        else push(v as R | string)
        break
      }
      case 'plural': {
        const n = Number(values[p.name] ?? 0)
        const exact = p.options[`=${n}`]
        const chosen = exact ?? p.options[pluralCategory(locale, n - p.offset)] ?? p.options.other
        for (const v of render(chosen, values, locale, tags, n - p.offset)) push(v)
        break
      }
      case 'select': {
        const chosen = p.options[String(values[p.name])] ?? p.options.other
        for (const v of render(chosen, values, locale, tags, hash)) push(v)
        break
      }
      case 'tag': {
        const inner = render(p.children, values, locale, tags, hash)
        const fn = tags?.[p.name] ?? (values[p.name] as TagFn<R | string> | undefined)
        if (typeof fn === 'function') push(fn(inner))
        else for (const v of inner) push(v)
        break
      }
    }
  }
  return out
}

/** Formats a message to a string. */
export function formatMessage(message: string, values: Values = {}, locale = 'en'): string {
  return render<string>(compile(message), values, locale).join('')
}

/** The names a message uses: placeholders, plural and select arguments and tags, for the catalog check. */
export function messageShape(message: string): { args: string[]; tags: string[]; plurals: Record<string, string[]> } {
  const args = new Set<string>(); const tags = new Set<string>(); const plurals: Record<string, string[]> = {}
  const walk = (ps: Part[]) => {
    for (const p of ps) {
      if (p.k === 'arg') args.add(p.name)
      else if (p.k === 'tag') { tags.add(p.name); walk(p.children) }
      else if (p.k === 'plural' || p.k === 'select') {
        args.add(p.name)
        if (p.k === 'plural') plurals[p.name] = [...new Set([...(plurals[p.name] ?? []), ...Object.keys(p.options)])].sort()
        for (const o of Object.values(p.options)) walk(o)
      }
    }
  }
  walk(parseMessage(message))
  return { args: [...args].sort(), tags: [...tags].sort(), plurals }
}
