// Note template placeholders (OpenSpec change note-templates, design D3):
// {{date}}, {{weekday}}, {{time}} and {{title}}, filled once, as
// internal/templatelib Fill does; both run
// internal/templatelib/testdata/placeholders.vectors.json. Pure, so the
// device's routine planner shares it.

/** What the placeholders read: the logical day, the time, the date order and clock, the language. */
export interface FillContext {
  date: string
  time: string
  order: 'DM' | 'MD' | 'YMD'
  hour12: boolean
  lang: string
}

const PLACEHOLDER = /\{\{(date|weekday|time|title)\}\}/g
const ANY_PLACEHOLDER = /\{\{([A-Za-z0-9_]+)\}\}/g

const WEEKDAYS: Record<string, string[]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  de: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
  es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  it: ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'],
  nl: ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'],
  pt: ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'],
  zh: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
}

/** The {{name}} placeholders of a text that are not one of the four. */
export function unknownPlaceholders(text: string): string[] {
  return [...text.matchAll(ANY_PLACEHOLDER)].filter((m) => !['date', 'weekday', 'time', 'title'].includes(m[1])).map((m) => m[0])
}

export function formatPlaceholderDate(day: string, order: FillContext['order']): string {
  if (day.length !== 10) return day
  const [y, m, d] = [day.slice(0, 4), day.slice(5, 7), day.slice(8, 10)]
  return order === 'DM' ? `${d}/${m}/${y}` : order === 'MD' ? `${m}/${d}/${y}` : day
}

export function formatPlaceholderTime(hhmm: string, hour12: boolean): string {
  if (!hour12 || hhmm.length !== 5) return hhmm
  const h = Number(hhmm.slice(0, 2))
  if (Number.isNaN(h)) return hhmm
  return `${h % 12 === 0 ? 12 : h % 12}${hhmm.slice(2)} ${h >= 12 ? 'PM' : 'AM'}`
}

function weekdayOf(day: string, lang: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return (WEEKDAYS[lang] ?? WEEKDAYS.en)[wd] ?? ''
}

/** Fills a template's title and text; in the title {{title}} reads as nothing, in the text it is the filled title. */
export function fillTemplate(title: string, text: string, c: FillContext): { title: string; text: string } {
  const vals: Record<string, string> = { date: formatPlaceholderDate(c.date, c.order), weekday: weekdayOf(c.date, c.lang), time: formatPlaceholderTime(c.time, c.hour12), title: '' }
  const repl = (s: string) => s.replace(PLACEHOLDER, (_m, name: string) => vals[name])
  const t = repl(title).split(/\s+/).filter(Boolean).join(' ')
  vals.title = t
  return { title: t, text: repl(text) }
}

/** The date order of a date_format preference ("system" follows the language), as templatelib.Order: routines fill with it. */
export function placeholderOrder(dateFormat: string | undefined, lang: string): FillContext['order'] {
  if (dateFormat === 'day-month') return 'DM'
  if (dateFormat === 'month-day') return 'MD'
  if (dateFormat === 'iso') return 'YMD'
  return lang === 'en' ? 'MD' : lang === 'zh' ? 'YMD' : 'DM'
}

/** The clock of a time_format preference ("system" follows the language), as templatelib.Hour12. */
export function placeholderHour12(timeFormat: string | undefined, lang: string): boolean {
  if (timeFormat === '12h') return true
  if (timeFormat === '24h') return false
  return lang === 'en'
}
