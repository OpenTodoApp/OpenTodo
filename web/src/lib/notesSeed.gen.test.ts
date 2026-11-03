// The documents of the notes fixture (OpenSpec change performance-10k, design D7,
// task 1.4): real Yjs documents and their Markdown projections, saved the way the
// note editor saves (each save an edit of the visible body), from a fixed seed.
// A generator, not a test: it runs only when NOTES_SEED_OUT names the output file
// (scripts/perf/notes-seed.mjs runs it), and writes one JSON line per save:
//   {"note": n, "save": k, "doc": "ydoc:v1:…", "text": "…"}
// cmd/perfseed -notes <file> writes them through the op log.
import { appendFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import * as Y from 'yjs'
import { activeBody, encodeDoc, newDoc, projectDoc, updateBody } from './richtext'
import { parseMarkdown } from './richtextMarkdown'

const out = process.env.NOTES_SEED_OUT
const NOTES = Number(process.env.NOTES_SEED_NOTES ?? 500)
const SAVES = Number(process.env.NOTES_SEED_SAVES ?? 300)
const CHARS = Number(process.env.NOTES_SEED_CHARS ?? 10_000)

/** mulberry32: the same seed gives the same notes. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WORDS = 'plan review draft call email order fix update check write send book pay renew clean prepare share sort archive measure paint repair buy return schedule test ship kitchen garden budget invoice report slides garage server backup laptop printer passport meeting client project release roadmap ticket feature library migration window door shelf'.split(' ')

it.runIf(!!out)('writes the notes fixture', () => {
  writeFileSync(out!, '')
  const r = rng(Number(process.env.NOTES_SEED ?? 10_000))
  const word = () => WORDS[Math.floor(r() * WORDS.length)]
  const sentence = () => {
    const s = Array.from({ length: 6 + Math.floor(r() * 10) }, word).join(' ')
    return s[0].toUpperCase() + s.slice(1) + '.'
  }
  for (let n = 0; n < NOTES; n++) {
    const doc = newDoc(1 + n)
    const lines: string[] = [`# Note ${n + 1}`]
    let buf = ''
    for (let k = 0; k < SAVES; k++) {
      // Each save adds a little (the note grows to about CHARS) and now and then edits a line.
      const target = Math.round(((k + 1) / SAVES) * CHARS)
      while (lines.join('\n\n').length < target) {
        if (r() < 0.2) lines.push(`- ${sentence()}`)
        else lines.push(`${sentence()} ${sentence()}`)
      }
      if (lines.length > 3 && r() < 0.3) lines[1 + Math.floor(r() * (lines.length - 1))] = sentence()
      const text = lines.join('\n\n')
      doc.transact(() => updateBody(activeBody(doc), parseMarkdown(text)))
      const value = encodeDoc(doc)
      buf += JSON.stringify({ note: n, save: k, doc: value, text: projectDoc(value) }) + '\n'
      if (buf.length > 8_000_000) { appendFileSync(out!, buf); buf = '' }
    }
    appendFileSync(out!, buf)
    doc.destroy()
  }
  void Y
}, 3_600_000)
