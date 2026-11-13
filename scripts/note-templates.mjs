// Note templates of the library (OpenSpec change note-templates, design D4):
// templates/notes/<slug>/note.yaml with optional <language>.yaml translations
// of title, summary and body. checkNoteLibrary names every problem with the
// template, the file and the path; compileNotes is the `notes` part of the
// compiled library (web/src/generated/templates.json, internal/templatelib).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parseYaml, YAML_TEMPLATE } from './deploy/yaml.mjs'

export const NOTES_DIR = 'notes'
export const NOTE_LIMITS = { title: 60, summary: 160, body: 8 * 1024 }
const KEYS = ['title', 'summary', 'icon', 'author', 'reviewed', 'body']
const TRANSLATED = ['title', 'summary', 'body']
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
const KNOWN = ['date', 'weekday', 'time', 'title']
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const PHONE = /(?:\+|\b00)\d[\d ()./-]{6,}\d|\b\d{3}[ .-]\d{3,4}[ .-]\d{3,4}\b/
const ANY_URL = /\b(?:https?:\/\/|www\.)\S+/gi

const placeholdersOf = (s) => [...String(s).matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)].map((m) => m[1])

function personal(text) {
  if (EMAIL.test(text)) return 'holds an e-mail address'
  if (PHONE.test(text)) return 'holds a phone number'
  for (const m of text.matchAll(ANY_URL)) if (!/^https:\/\//i.test(m[0])) return `holds a link that is not https: ${m[0]}`
  return null
}

/** The note templates under templates/notes/, with every problem found. */
export function checkNoteLibrary(templatesDir, { icons, languages }) {
  const dir = join(templatesDir, NOTES_DIR)
  const notes = []
  const problems = []
  if (!existsSync(dir)) return { notes, problems }
  for (const slug of readdirSync(dir).sort()) {
    const p = join(dir, slug)
    if (!statSync(p).isDirectory()) continue
    const fail = (file, path, msg) => problems.push(`notes/${slug}/${file}${path ? `: ${path}` : ''}: ${msg}`)
    if (!SLUG.test(slug)) fail('', '', 'folder name must be lowercase letters, digits and hyphens')
    const read = (name) => {
      try { return parseYaml(readFileSync(join(p, name), 'utf8'), YAML_TEMPLATE) } catch (err) { fail(name, '', err.message); return null }
    }
    if (!existsSync(join(p, 'note.yaml'))) { fail('note.yaml', '', 'missing'); continue }
    const src = read('note.yaml')
    if (!src || typeof src !== 'object' || Array.isArray(src)) { if (src) fail('note.yaml', '', 'must be a map'); continue }
    for (const k of Object.keys(src)) if (!KEYS.includes(k)) fail('note.yaml', k, 'is not a note template field')
    const text = (k, max) => {
      const v = src[k]
      if (typeof v !== 'string' || !v.trim()) return fail('note.yaml', k, 'is required')
      if (max && (k === 'body' ? Buffer.byteLength(v) : [...v].length) > max) fail('note.yaml', k, `is longer than ${k === 'body' ? `${max} bytes` : `${max} characters`}`)
    }
    text('title', NOTE_LIMITS.title)
    text('summary', NOTE_LIMITS.summary)
    text('body', NOTE_LIMITS.body)
    text('author')
    if (typeof src.icon !== 'string' || !icons.has(src.icon)) fail('note.yaml', 'icon', `${src.icon ?? 'nothing'} is not in the icon catalogue`)
    if (!DAY.test(String(src.reviewed ?? ''))) fail('note.yaml', 'reviewed', 'must be a date YYYY-MM-DD')
    for (const k of TRANSLATED) {
      if (typeof src[k] !== 'string') continue
      for (const name of placeholdersOf(src[k])) if (!KNOWN.includes(name)) fail('note.yaml', k, `unknown placeholder {{${name}}}`)
      const pd = personal(src[k])
      if (pd) fail('note.yaml', k, pd)
    }
    const overlays = {}
    for (const name of readdirSync(p).sort()) {
      if (name === 'note.yaml') continue
      const m = /^([a-z]{2})\.yaml$/.exec(name)
      if (!m || !languages.includes(m[1])) { fail(name, '', `unexpected file; translations are ${languages.map((l) => `${l}.yaml`).join(', ')}`); continue }
      const doc = read(name)
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) { if (doc) fail(name, '', 'must be a map'); continue }
      const texts = {}
      for (const [k, v] of Object.entries(doc)) {
        if (!TRANSLATED.includes(k)) { fail(name, k, 'is not in the English file (a translation holds title, summary and body only)'); continue }
        if (typeof v !== 'string' || !v.trim()) { fail(name, k, 'must be text'); continue }
        for (const ph of placeholdersOf(v)) if (!KNOWN.includes(ph)) fail(name, k, `unknown placeholder {{${ph}}}`)
        const missing = [...new Set(placeholdersOf(src[k] ?? ''))].filter((ph) => !placeholdersOf(v).includes(ph))
        if (missing.length) fail(name, k, `drops the placeholder ${missing.map((x) => `{{${x}}}`).join(', ')} the English text uses`)
        const pd = personal(v)
        if (pd) fail(name, k, pd)
        texts[k] = v
      }
      overlays[m[1]] = texts
    }
    notes.push({ slug, src, overlays })
  }
  const titles = new Map()
  for (const n of notes) {
    const key = String(n.src.title ?? '').trim().toLowerCase()
    if (titles.has(key)) problems.push(`notes/${n.slug}/note.yaml: title: "${n.src.title}" is also the title of notes/${titles.get(key)}`)
    else titles.set(key, n.slug)
  }
  return { notes, problems }
}

/** The compiled `notes` of the library, in English title order: text per language. */
export function compileNotes(notes) {
  return notes.map(({ slug, src, overlays }) => {
    const L = (k) => {
      const out = { en: src[k] }
      for (const lang of Object.keys(overlays).sort()) if (overlays[lang][k] !== undefined) out[lang] = overlays[lang][k]
      return out
    }
    return { slug, icon: src.icon, author: src.author, reviewed: String(src.reviewed), title: L('title'), summary: L('summary'), body: L('body') }
  }).sort((a, b) => a.title.en.localeCompare(b.title.en))
}
