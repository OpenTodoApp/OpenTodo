// The notes hot paths, timed against a reference scan of the same input: a pull
// request that slows one of them fails here, in the Web job, instead of only in the
// nightly Notes budgets (docs/performance.md), whose milliseconds swing threefold
// between CI runners on the same commit (#1465 slowed linksIn by about a third and only
// the nightly saw it). Absolute times say nothing on a shared runner, so each path
// is measured beside a reference loop over the same text, the least work any scan of
// it does (a native split and an includes per line), in interleaved pairs, and the
// median of the pair ratios is held to a recorded limit. Load on the runner slows
// both halves of a pair alike; a ratio over its limit is measured again before the
// test fails, because a regression stays over it and a burst of load does not.
//
// To change a limit on purpose: run this file a few times
// (`npx vitest run src/lib/notesHotPaths.test.ts --silent=false`), read the printed ratios and set
// MAX to the new ratio × 1.5, rounded, saying why in the pull request.
import { describe, expect, it } from 'vitest'
import { linksIn } from './noteLinkGrammar'

// Only the link grammar is held for now: on this fixture #1465's line loop moves it from
// about 1.55× to 2.7–3.2×, while runs beside lint and typecheck stayed below 1.8×. The
// link index and search paths did not separate #1465 from load as clearly, so they are
// not asserted (a flaky check is worse than none).
/** Time per run over the reference's: measured about 1.55× in November 2026, × 1.5. */
const MAX = { linksIn: 2.3 }

// ---- the notes: 300 generated notes, about 1 MB of Markdown ----

function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WORDS = 'plan trip call review budget draft meeting garden kitchen invoice report travel notes week launch design'.split(' ')
const NOTES = 300
const id = (i: number) => `n${String(i).padStart(4, '0')}`

function noteBody(i: number, r: () => number): string {
  const word = () => WORDS[Math.floor(r() * WORDS.length)]
  const words = (n: number) => Array.from({ length: n }, word).join(' ')
  const lines: string[] = [`# ${words(3)}`, '']
  // Few lines with a link, as in most notes: the work per line and per character (the
  // split, the fence test) is where a slower line loop shows (#1465 about doubles it).
  let size = 0
  const push = (...ls: string[]) => { for (const l of ls) { lines.push(l); size += l.length + 1 } }
  while (size < 3_300) {
    const k = r()
    if (k < 0.01) push('```ts', `const x = '[not a link](?note=${id(i)})'`, '```')
    else if (k < 0.04) push(`- ${words(2)} [${word()}](?note=${id(Math.floor(r() * NOTES))})`)
    else if (k < 0.05) push(`- [ ] ${word()} \`code\` [${word()}](?task=t${Math.floor(r() * 50)})`)
    else if (k < 0.12) push(`## ${words(2)}`, '')
    else if (k < 0.3) push('')
    else push(`${words(20)} **${word()}** ${words(16)}`)
  }
  const text = lines.join('\n')
  // A few notes written on Windows: the CRLF path of linksIn and stripMarkdown.
  return i % 25 === 0 ? text.replace(/\n/g, '\r\n') : text
}

const r = rng(1465)
const texts = Array.from({ length: NOTES }, (_, i) => noteBody(i, r))

// ---- timing ----

let sink = 0

/** The least work any scan of the notes does: every line once. */
function reference(): void {
  for (const text of texts) for (const line of text.split('\n')) if (line.includes('](?')) sink++
}

const paths: Record<keyof typeof MAX, () => void> = {
  linksIn: () => { for (const text of texts) sink += linksIn(text).length },
}

const time = (fn: () => void, reps: number) => {
  const start = performance.now()
  for (let i = 0; i < reps; i++) fn()
  return performance.now() - start
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

/** How many runs of fn take about 6 ms: long enough for the timer and a stray pause not to decide a sample. */
const repsFor = (fn: () => void) => Math.max(1, Math.round(6 / Math.max(time(fn, 1), 0.05)))

/** The median of 7 interleaved path/reference ratios (time per run), after a warm-up of both. */
function ratio(fn: () => void): number {
  for (let i = 0; i < 3; i++) { fn(); reference() }
  const reps = repsFor(fn)
  const refReps = repsFor(reference)
  const out: number[] = []
  for (let i = 0; i < 7; i++) {
    // Alternate the order so neither side always runs on a warmer cache or a quieter moment.
    let p: number, ref: number
    if (i % 2) { p = time(fn, reps); ref = time(reference, refReps) }
    else { ref = time(reference, refReps); p = time(fn, reps) }
    out.push((p / reps) / (ref / refReps))
  }
  return median(out)
}

// Vitest runs files in parallel but a file's tests one after another; a pair shares the
// load of the moment, so the ratio holds while other files take the CPU.
describe('notes hot paths against a line scan of the same notes', () => {
  it('works on about 1 MB of notes with links, code fences and CRLF', () => {
    const size = texts.reduce((n, t) => n + t.length, 0)
    expect(size).toBeGreaterThan(900_000)
    expect(size).toBeLessThan(1_200_000)
    expect(texts.filter((t) => t.includes('\r\n')).length).toBe(12)
    expect(texts.reduce((n, t) => n + linksIn(t).length, 0)).toBeGreaterThan(150)
  })

  for (const name of Object.keys(MAX) as (keyof typeof MAX)[]) {
    it(`${name} stays within ${MAX[name]}× the reference`, () => {
      let best = Infinity
      for (let attempt = 0; attempt < 3 && best > MAX[name]; attempt++) best = Math.min(best, ratio(paths[name]))
      console.info(`notes hot path ${name}: ${best.toFixed(2)}× the reference (max ${MAX[name]})`)
      expect(best).toBeLessThanOrEqual(MAX[name])
      expect(sink).toBeGreaterThan(0)
    })
  }
})
