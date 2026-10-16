// Spoken attribute normalisation (OpenSpec `voice-capture`, D3): turns the spoken form
// of quick-add tokens into their typed form before the transcript reaches the parser,
// so "renew insurance hashtag home priority two" becomes "renew insurance #home p2".
// One deterministic left-to-right pass; at each word the longest rule match over the
// active languages wins (ties go to the earlier language, then the earlier rule);
// words no rule claims are copied unchanged. Numbers are only converted next to a
// time, priority or duration cue, so "buy two apples" stays as it is.
import type { ProjectRef } from '../../nlp/attributes'
import { findLabel, type LabelRef } from '../../nlp/quickadd'
import { activeLanguages, normalize, VOCABULARIES, type Vocabulary } from '../../nlp/vocab'
import { de } from './de'
import { en } from './en'
import { es } from './es'
import { fr } from './fr'
import { it } from './it'
import { pt } from './pt'
import type { SpokenTable } from './types'

export type { SpokenTable } from './types'

/** Every spoken table, keyed like the parser's vocabularies. */
export const SPOKEN_TABLES: Record<string, SpokenTable> = { en, de, fr, it, es, pt }

export interface SpokenContext {
  /** Existing projects, for "project <name>" and multi-word "hashtag <name>". */
  projects?: readonly ProjectRef[]
  /** Existing labels, for "at <name>" and the exact spelling of "label <name>". */
  labels?: readonly LabelRef[]
}

/** Matching form of a word: the parser's fold plus no trailing sentence punctuation. */
function bare(word: string): string {
  return normalize(word).replace(/[.!?]+$/, '')
}

const foldName = (s: string) => normalize(s).replace(/[\s_-]+/g, '')

interface Lang {
  t: SpokenTable
  v: Vocabulary
  sets: Map<string, Set<string>>
  numbers: Map<string, number>
}

const langCache = new Map<string, Lang>()

function lang(code: string): Lang {
  let l = langCache.get(code)
  if (!l) {
    const t = SPOKEN_TABLES[code]
    const v = VOCABULARIES[code]
    const lists: Record<string, string[]> = {
      hashtag: t.hashtag, project: t.project, label: t.label, labelAt: t.labelAt, priority: t.priority, minuteZero: t.minuteZero,
      minutes: t.minutes, and: t.and, durationBefore: t.durationBefore, at: v.atWords, hourWord: v.hourWords, am: v.am, pm: v.pm,
      in: v.inWords, one: v.oneWords, hour: v.units.hour, unit: [...v.units.hour, ...v.units.day, ...v.units.week, ...v.units.month],
    }
    const sets = new Map(Object.entries(lists).map(([k, words]) => [k, new Set(words.map((w) => w.split(' ').map(bare).join(' ')))]))
    const numbers = new Map(Object.entries(t.numbers).map(([w, n]) => [w.split(' ').map(bare).join(' '), n]))
    l = { t, v, sets, numbers }
    langCache.set(code, l)
  }
  return l
}

interface Match {
  n: number
  out: string
}

/**
 * Normalise a final transcript for quick add. `languages` are the active quick-add
 * languages (English is always added, as for the parser); unknown codes are ignored.
 */
export function normalizeSpoken(text: string, languages: readonly string[], ctx: SpokenContext = {}): string {
  const tokens = text.trim().replace(/[.!?]+$/, '').split(/\s+/).filter(Boolean)
  const words = tokens.map(bare)
  const langs = activeLanguages(languages).filter((c) => c in SPOKEN_TABLES).map(lang)
  const projects = (ctx.projects ?? []).filter((p) => !p.archived && !p.deleted_at)
  const labels = ctx.labels ?? []

  /** Length of the longest phrase from `set` starting at word `i` (0 if none). */
  const phrase = (l: Lang, key: string, i: number, max = 3): number => {
    const set = l.sets.get(key)
    if (!set || set.size === 0) return 0
    for (let n = Math.min(max, words.length - i); n >= 1; n--) if (set.has(words.slice(i, i + n).join(' '))) return n
    return 0
  }
  /** A number at word `i`: digits or a spoken 0–59, longest phrase first. */
  const number = (l: Lang, i: number): { value: number; n: number; spoken: boolean } | null => {
    if (i >= words.length) return null
    if (/^\d{1,2}$/.test(words[i])) return { value: Number(words[i]), n: 1, spoken: false }
    for (let n = Math.min(3, words.length - i); n >= 1; n--) {
      const v = l.numbers.get(words.slice(i, i + n).join(' '))
      if (v !== undefined) return { value: v, n, spoken: true }
    }
    return null
  }
  const orig = (from: number, to: number) => tokens.slice(from, to).join(' ')
  const clean = (w: string) => w.replace(/[,;.!?]+$/, '')
  /** An existing project named by 1–3 words at `i` (exact, folded). */
  const projectAt = (i: number): Match | null => {
    for (let n = Math.min(3, words.length - i); n >= 1; n--) {
      const want = foldName(tokens.slice(i, i + n).join(''))
      // The spoken words joined into one `#token`; project matching ignores case and spaces.
      if (want && projects.some((p) => foldName(p.name) === want)) return { n, out: `#${tokens.slice(i, i + n).map(clean).join('')}` }
    }
    return null
  }

  const rules: ((l: Lang, i: number) => Match | null)[] = [
    // "# home" / "@ call" written with a space by the recogniser.
    (_l, i) => ((words[i] === '#' || words[i] === '@') && i + 1 < words.length ? { n: 2, out: words[i] + clean(tokens[i + 1]) } : null),
    // hashtag <project | word>
    (l, i) => {
      const h = phrase(l, 'hashtag', i)
      if (!h || i + h >= words.length) return null
      const p = projectAt(i + h)
      return p ? { n: h + p.n, out: p.out } : { n: h + 1, out: `#${clean(tokens[i + h])}` }
    },
    // project <existing project>
    (l, i) => {
      const h = phrase(l, 'project', i)
      const p = h ? projectAt(i + h) : null
      return p ? { n: h + p.n, out: p.out } : null
    },
    // label <word>, spelled like an existing label when there is one
    (l, i) => {
      const h = phrase(l, 'label', i)
      if (!h || i + h >= words.length) return null
      const name = clean(tokens[i + h])
      return name ? { n: h + 1, out: `@${findLabel(name, labels)?.name ?? name}` } : null
    },
    // at <existing label>
    (l, i) => {
      const h = phrase(l, 'labelAt', i)
      if (!h || i + h >= words.length) return null
      const found = findLabel(clean(tokens[i + h]), labels)
      return found ? { n: h + 1, out: `@${found.name}` } : null
    },
    // priority <1–4>
    (l, i) => {
      const h = phrase(l, 'priority', i)
      const num = h ? number(l, i + h) : null
      return num && num.value >= 1 && num.value <= 4 ? { n: h + num.n, out: `p${num.value}` } : null
    },
    // [at] <hour> [hour word] [minutes] [am|pm], needing at least one time cue
    (l, i) => {
      const at = phrase(l, 'at', i)
      const hour = number(l, i + at)
      if (!hour) return null
      let k = i + at + hour.n
      const hw = phrase(l, 'hourWord', k)
      k += hw
      let minute: number | undefined
      const zero = phrase(l, 'minuteZero', k)
      const m = number(l, k + zero)
      // Minutes are two-digit values ("thirty", "45") or a zero word plus a digit ("oh five").
      if (m && (zero ? m.value < 10 : m.value >= 10 || (!m.spoken && words[k].length === 2))) {
        minute = m.value
        k += zero + m.n
      }
      const pm = phrase(l, 'pm', k)
      const am = pm ? 0 : phrase(l, 'am', k)
      k += pm + am
      if (!at && !hw && !pm && !am) return null
      const h = hour.value
      if (pm || am ? h < 1 || h > 12 : h > 23) return null
      // Nothing spoken to convert ("at 9", "9 Uhr"): leave the words to the parser.
      if (!hour.spoken && minute === undefined && !pm && !am) return null
      const time = `${h}${minute !== undefined ? `:${String(minute).padStart(2, '0')}` : ''}${pm ? 'pm' : am ? 'am' : ''}`
      const tail = hw && minute === undefined ? ` ${orig(i + at + hour.n, i + at + hour.n + hw)}` : ''
      return { n: k - i, out: `${at ? `${orig(i, i + at)} ` : ''}${time}${tail}` }
    },
    // in <number> <unit>: digits for the parser's "in 3 days"
    (l, i) => {
      const inN = phrase(l, 'in', i)
      const num = inN ? number(l, i + inN) : null
      if (!num || !num.spoken || num.value < 1) return null
      const u = phrase(l, 'unit', i + inN + num.n)
      return u ? { n: inN + num.n + u, out: `${orig(i, i + inN)} ${num.value} ${orig(i + inN + num.n, i + inN + num.n + u)}` } : null
    },
    // [for] <n> hour(s) [and <m> minutes] | [for] <m> minutes  →  +<total>m
    (l, i) => {
      if (i > 0 && l.sets.get('in')!.has(words[i - 1])) return null // "in two hours" is a time
      const before = phrase(l, 'durationBefore', i)
      let k = i + before
      const count = (at: number): { value: number; n: number } | null => {
        const one = phrase(l, 'one', at)
        return number(l, at) ?? (one ? { value: 1, n: one } : null)
      }
      let total = 0
      const h = count(k)
      const hu = h ? phrase(l, 'hour', k + h.n) : 0
      if (h && hu) {
        total = h.value * 60
        k += h.n + hu
        const and = phrase(l, 'and', k)
        const m = count(k + and)
        const mu = m ? phrase(l, 'minutes', k + and + m.n) : 0
        if (m && mu) {
          total += m.value
          k += and + m.n + mu
        }
      } else {
        const m = count(k)
        const mu = m ? phrase(l, 'minutes', k + m.n) : 0
        if (!m || !mu) return null
        total = m.value
        k += m.n + mu
      }
      return total > 0 ? { n: k - i, out: `+${total}m` } : null
    },
  ]

  const out: string[] = []
  for (let i = 0; i < tokens.length; ) {
    let best: Match | null = null
    for (const l of langs) {
      for (const rule of rules) {
        const m = rule(l, i)
        if (m && (!best || m.n > best.n)) best = m
      }
    }
    if (best) {
      out.push(best.out)
      i += best.n
    } else {
      out.push(tokens[i])
      i += 1
    }
  }
  return out.join(' ')
}
