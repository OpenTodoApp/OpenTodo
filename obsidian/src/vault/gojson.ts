// What the Go engine's standard library does to values, where the two engines
// must agree byte for byte (obsidian-vault-sync D2): encoding/json's Marshal
// (op values and their ids), fmt's %q (report texts), fmt's %v of a decoded
// JSON value (custom field values on a line), and SHA-256 hex.
import { sha256 } from '../../../web/src/lib/ids'

const HEX = '0123456789abcdef'
const enc = new TextEncoder()

function goString(s: string): string {
  let out = '"'
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    switch (ch) {
      case '"': out += '\\"'; continue
      case '\\': out += '\\\\'; continue
      case '\n': out += '\\n'; continue
      case '\r': out += '\\r'; continue
      case '\t': out += '\\t'; continue
      case '\b': out += '\\b'; continue
      case '\f': out += '\\f'; continue
    }
    if (c < 0x20 || ch === '<' || ch === '>' || ch === '&' || c === 0x2028 || c === 0x2029) {
      out += '\\u' + c.toString(16).padStart(4, '0')
      continue
    }
    // A lone surrogate is invalid UTF-8 to Go: it becomes U+FFFD.
    out += c >= 0xd800 && c <= 0xdfff ? '�' : ch
  }
  return out + '"'
}

/** encoding/json.Marshal of a JSON value: object keys sorted, <>& escaped. */
export function goJSON(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'string') return goString(v)
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (Array.isArray(v)) return '[' + v.map(goJSON).join(',') + ']'
  const o = v as Record<string, unknown>
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort(byteOrder)
  return '{' + keys.map((k) => goString(k) + ':' + goJSON(o[k])).join(',') + '}'
}

/** Go's string order: by UTF-8 bytes, which is code point order. */
export function byteOrder(a: string, b: string): number {
  if (a === b) return 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; ) {
    const ca = a.codePointAt(i)!
    const cb = b.codePointAt(i)!
    if (ca !== cb) return ca < cb ? -1 : 1
    i += ca > 0xffff ? 2 : 1
  }
  return a.length < b.length ? -1 : 1
}

/** Sorted keys, as the Go engine's sortedKeys. */
export function sortedKeys(o: Record<string, unknown> | Map<string, unknown>): string[] {
  return [...(o instanceof Map ? o.keys() : Object.keys(o))].sort(byteOrder)
}

/** unicode.IsPrint, close enough for report texts: no control or format characters. */
function printable(c: number): boolean {
  if (c < 0x20 || (c >= 0x7f && c < 0xa0)) return false
  return !/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u.test(String.fromCodePoint(c)) || c === 0x200d
}

/** fmt's %q of a string (strconv.Quote). */
export function goQuote(s: string): string {
  let out = '"'
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    if (ch === '"' || ch === '\\') { out += '\\' + ch; continue }
    if (c === 0x20 || (c > 0x20 && printable(c))) { out += ch; continue }
    switch (ch) {
      case '\x07': out += '\\a'; continue
      case '\b': out += '\\b'; continue
      case '\f': out += '\\f'; continue
      case '\n': out += '\\n'; continue
      case '\r': out += '\\r'; continue
      case '\t': out += '\\t'; continue
      case '\v': out += '\\v'; continue
    }
    if (c < 0x80) out += '\\x' + c.toString(16).padStart(2, '0')
    else if (c < 0x10000) out += '\\u' + c.toString(16).padStart(4, '0')
    else out += '\\U' + c.toString(16).padStart(8, '0')
  }
  return out + '"'
}

/** fmt.Sprint of a number decoded from JSON (a float64): %g with the shortest digits. */
function goFloat(x: number): string {
  if (x === 0) return Object.is(x, -0) ? '-0' : '0'
  const [mant, e] = x.toExponential().split('e')
  const exp = Number(e)
  if (exp < -4 || exp >= 6) {
    const digits = mant.replace('.', '').replace('-', '')
    const m = (x < 0 ? '-' : '') + digits[0] + (digits.length > 1 ? '.' + digits.slice(1) : '')
    return `${m}e${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`
  }
  return String(x)
}

/** fmt.Sprint of a value decoded from JSON. */
export function goSprint(v: unknown): string {
  if (v === null || v === undefined) return '<nil>'
  if (typeof v === 'string') return v
  if (typeof v === 'number') return goFloat(v)
  if (typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return '[' + v.map(goSprint).join(' ') + ']'
  const o = v as Record<string, unknown>
  return 'map[' + Object.keys(o).sort(byteOrder).map((k) => `${k}:${goSprint(o[k])}`).join(' ') + ']'
}

export function hex(b: Uint8Array): string {
  let s = ''
  for (const x of b) s += HEX[x >> 4] + HEX[x & 15]
  return s
}

export function utf8(s: string): Uint8Array {
  return enc.encode(s)
}

/** The hash the state keeps for a file's bytes (hashOf). */
export function hashOf(text: string): string {
  return hex(sha256(utf8(text)))
}

/** An op's id from what it changes (opID in exchange.go). */
export function opID(device: string, entity: string, id: string, field: string, base: string, value: string | null): string {
  const head = utf8(`${device}\x00${entity}\x00${id}\x00${field}\x00${base}\x00`)
  const tail = value === null ? new Uint8Array(0) : utf8(value)
  const all = new Uint8Array(head.length + tail.length)
  all.set(head)
  all.set(tail, head.length)
  return 'v-' + hex(sha256(all).slice(0, 20))
}

export const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)

export function short(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
}
