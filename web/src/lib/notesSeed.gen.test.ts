// The documents of the notes fixture (OpenSpec change performance-10k, design D7,
// task 1.4): real Yjs documents and their Markdown projections, saved the way the
// note editor saves (each save an edit of the visible body), from a fixed seed.
// A generator, not a test: it runs only when NOTES_SEED_OUT names the output file
// (scripts/perf/notes-seed.mjs runs it), and writes one JSON line per save:
//   {"note": n, "save": k, "doc": "ydoc:v1:…", "text": "…"}
// cmd/perfseed -notes <file> writes them through the op log.
//
// Links (note-links D5): the second block of each standalone note (even n) links to
// the next two standalone notes and to the task of the next task note; the first
// 200 task notes (odd n) link to the standalone note before them. Unlinked mentions
// (unlinked-mentions 3.1): standalone notes 2 to 80 name "Note 1" in plain text, so the
// note the note-references metric opens has 40 mentions. Ids are the ones
// cmd/perfseed gives (internal/perfseed gen.id, the same name-based id as ids.ts).
import { appendFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import * as Y from 'yjs'
import { nameId } from './ids'
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

/** internal/perfseed: BigOpen open tasks in the big project come first; a task note n belongs to task BigOpen+n. */
const BIG_OPEN = 2000
const LINKED_TASK_NOTES = 200
const SEED = Number(process.env.PERFSEED_SEED ?? 10_000)
const pid = (kind: string, n: number) => nameId('perfseed', `${SEED}/${kind}/${n}`)

/** The links block of note n (null for a task note past the first LINKED_TASK_NOTES). */
function linksLine(n: number): string | null {
  const even = (k: number) => (k % NOTES) - ((k % NOTES) % 2)
  if (n % 2 === 0) {
    const a = even(n + 2)
    const b = even(n + 4)
    const t = (n + 1) % NOTES
    return `Related: [Note ${a + 1}](?note=${pid('note', a)}), [Note ${b + 1}](?note=${pid('note', b)}) and [the task](?task=${pid('task', BIG_OPEN + t)}).`
  }
  return (n - 1) / 2 < LINKED_TASK_NOTES ? `See [Note ${n}](?note=${pid('note', n - 1)}).` : null
}

/** The plain mention of the linked note's title (perfseed titles note 0 "Note 1"). */
const MENTION = 'Mentions Note 1 in passing.'

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
    const links = linksLine(n)
    if (links) lines.push(links)
    if (n % 2 === 0 && n >= 2 && n <= 80) lines.push(MENTION)
    // Edits leave the heading and the links block alone.
    const kept = lines.length
    let buf = ''
    for (let k = 0; k < SAVES; k++) {
      // Each save adds a little (the note grows to about CHARS) and now and then edits a line.
      const target = Math.round(((k + 1) / SAVES) * CHARS)
      while (lines.join('\n\n').length < target) {
        if (r() < 0.2) lines.push(`- ${sentence()}`)
        else lines.push(`${sentence()} ${sentence()}`)
      }
      if (lines.length > kept + 2 && r() < 0.3) lines[kept + Math.floor(r() * (lines.length - kept))] = sentence()
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
