// Dates and times in the machine's time zone, as the Go engine reads them with
// time.Location: an IANA name ("Europe/Berlin", "UTC").
const formats = new Map<string, Intl.DateTimeFormat>()

function format(tz: string): Intl.DateTimeFormat {
  let f = formats.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    formats.set(tz, f)
  }
  return f
}

function parts(ms: number, tz: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of format(tz).formatToParts(new Date(ms))) if (p.type !== 'literal') out[p.type] = Number(p.value)
  return out
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** The calendar date of an instant in tz: YYYY-MM-DD. */
export function localDate(ms: number, tz: string): string {
  const p = parts(ms, tz)
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`
}

/** The local date and time of an instant in tz: YYYY-MM-DD HH:MM. */
export function localDateTime(ms: number, tz: string): string {
  const p = parts(ms, tz)
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`
}

/** The offset of tz from UTC at an instant, in ms. */
function offset(ms: number, tz: string): number {
  const p = parts(ms, tz)
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUTC - (ms - (((ms % 1000) + 1000) % 1000))
}

/** The instant of local midnight on date in tz (time.ParseInLocation of a date), or null for an invalid date. */
export function midnight(date: string, tz: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return null
  const wall = Date.UTC(y, mo - 1, d)
  let t = wall - offset(wall, tz)
  const o2 = offset(t, tz)
  if (wall - o2 !== t) t = wall - o2
  return t
}

/** The machine's own zone. */
export function systemZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
