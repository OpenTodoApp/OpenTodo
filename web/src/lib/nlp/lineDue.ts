// The phone's date picker writes into the line (OpenSpec change
// phone-quickadd-date-picker, D1, D3): a picked due date becomes words the parser
// reads back as exactly that date and time ("tomorrow", "Fri 28 Nov 17:00"), so the
// chip, the preview and the saved task come from parsing as a typed date does. Each
// worded form is kept only when parsing it gives the picked date back; the ISO date
// is the last resort, for a language without its own words.
import type { Due } from '../types'
import { parse, type ParseContext } from './parse'
import type { Span } from './tokenize'
import { activeLanguages, VOCABULARIES } from './vocab'

// Languages that write weekday and month abbreviations with a capital.
const CAPITALISED = new Set(['en', 'de'])

function dayOffset(iso: string, today: string): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
}

/** The worded forms of a date in the line's first language, preferred first. */
function wordedDates(iso: string, ctx: Omit<ParseContext, 'dismissed'>): string[] {
  const code = activeLanguages(ctx.languages)[0]
  const v = VOCABULARIES[code]
  const cap = (s: string) => (CAPITALISED.has(code) ? s.charAt(0).toUpperCase() + s.slice(1) : s)
  const [y, m, d] = iso.split('-').map(Number)
  const offset = dayOffset(iso, ctx.today)
  // Today and tomorrow by their one word; later days by weekday and date ("Fri 28 Nov").
  const relative = offset === 0 || offset === 1 ? Object.entries(v.dayWords).filter(([w, n]) => n === offset && !/\s/.test(w)).map(([w]) => w) : []
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const names = v.weekdays[(wd + 6) % 7]
  const weekday = cap(names[1] ?? names[0])
  const month = cap(v.months[m - 1].abbr[0] ?? v.months[m - 1].names[0])
  return [...relative, `${weekday} ${d} ${month}`, `${d} ${month}`, `${month} ${d}`, `${weekday} ${d} ${month} ${y}`, `${d} ${month} ${y}`]
}

/** The words the line gets for `due`: the first form the parser reads back as it, else the ISO date. */
export function duePhrase(due: Due, ctx: Omit<ParseContext, 'dismissed'>): string {
  const time = due.time ? ` ${due.time}` : ''
  const reads = (phrase: string) => {
    const r = parse(`x ${phrase}`, { ...ctx, dismissed: [] })
    return r.title === 'x' && !r.evening && r.due?.date === due.date && (r.due.time ?? undefined) === due.time
  }
  return wordedDates(due.date, ctx).map((w) => w + time).find(reads) ?? `${due.date}${time}`
}

/**
 * The line with its due date replaced by `due`'s words, or removed for null: the
 * spans the current date was read from (`spans`, none when the line sets no date)
 * are cut, and the new words go at the end, after one space.
 */
export function withDue(line: string, spans: readonly Span[], due: Due | null, ctx: Omit<ParseContext, 'dismissed'>): string {
  let rest = line
  for (const s of [...spans].sort((a, b) => b.start - a.start)) rest = rest.slice(0, s.start) + rest.slice(s.end)
  rest = rest.replace(/\s{2,}/g, ' ').trim()
  if (!due) return rest
  return `${rest}${rest ? ' ' : ''}${duePhrase(due, ctx)}`
}
