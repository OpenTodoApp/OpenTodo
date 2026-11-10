// The on-device note tools (OpenSpec change assistant-device-reads, D1, D2):
// list_notes, search_notes and get_note of internal/agenttools/read_notes.go over
// this device's decrypted rows. The matching, ranking and snippets are
// noteSearch.ts (pinned to internal/notesearch); this file only shapes results,
// pinned to the server's by read.vectors.json. The device answers as the server
// does for an account with end-to-end encryption (no note links), except that it
// searches: it holds the decrypted notes, and they stay here.
import { isCiphertext } from '../crypto'
import { pendingAppends } from '../noteAppends'
import { noteText } from '../noteList'
import { parseQuery, rankNotes, snippet, type SnippetSegment } from '../noteSearch'
import type { Clock } from '../types'
import { ArgError, ToolError, only, pageLimit, text, trimmed, type Args } from './args'
import { isOpen, isoTime, list, liveRows, num, str, visibleTask, type Row, type Snapshot } from './data'

/** list_notes' default page (NoteListDefault). */
const NOTE_LIST_DEFAULT = 50
/** The server's words for an untitled note and for text this device cannot read (UntitledNote, e2ee.Placeholder). */
const UNTITLED = 'Untitled note'
const PLACEHOLDER = 'Encrypted item'
/** The snippet length in code points (notesearch.DefaultSnippet). */
const SNIPPET = 140

type Kind = 'note' | 'task' | 'project'

interface NoteRow {
  kind: Kind
  id: string
  title: string
  /** The text as shown: the projection, then the pending appends. */
  text: string
  /** Title and text for matching ("" for ciphertext). */
  plainT: string
  plainX: string
  projectId: string
  labels: string[]
  updated: number
  version: string
  encrypted: boolean
  completed: boolean
  archived: boolean
}

const shown = (v: string) => (isCiphertext(v) ? PLACEHOLDER : v)
const plain = (v: string) => (isCiphertext(v) ? '' : v)

/** The body clock: the latest clock among the note fields and the appends, as "ts:device" ("0" when none). */
function bodyVersion(clock: Clock | undefined): { ts: number; version: string } {
  let best: { ts: number; device: string } | null = null
  for (const [f, c] of Object.entries(clock ?? {})) {
    if (f !== 'description' && f !== 'notes_doc' && !f.startsWith('appends.')) continue
    if (!best || c.ts > best.ts || (c.ts === best.ts && c.device > best.device)) best = c
  }
  return best && best.ts ? { ts: best.ts, version: `${best.ts}:${best.device}` } : { ts: 0, version: '0' }
}

/** A note's text as plain-text readers show it (sync.PlainText), its description read through f. */
const textOf = (r: Row, f: (v: string) => string) => noteText({ ...(r as Parameters<typeof noteText>[0]), description: f(str(r, 'description')) })

function noteRow(kind: Kind, r: Row, titleField: string): NoteRow {
  const appends = (r.appends ?? {}) as Record<string, unknown>
  const title = str(r, titleField)
  const v = bodyVersion(r._clock as Clock | undefined)
  const row: NoteRow = {
    kind, id: str(r, 'id'), title: shown(title), text: textOf(r, shown), plainT: plain(title), plainX: textOf(r, plain),
    projectId: '', labels: [], updated: v.ts || num(r, 'created_at'), version: v.version,
    encrypted: isCiphertext(title) || isCiphertext(r.description) || Object.values(appends).some(isCiphertext), completed: false, archived: false,
  }
  if (kind === 'note' && !title) { row.title = UNTITLED; row.plainT = '' }
  return row
}

const hasNote = (r: Row) => str(r, 'description') !== '' || pendingAppends(r as Parameters<typeof pendingAppends>[0]).length > 0

/** Standalone notes outside projects kept away or deleted (liveNotes). */
async function liveNotes(snap: Snapshot): Promise<Row[]> {
  return (await liveRows('notes')).filter((n) => !str(n, 'project_id') || snap.projects.has(str(n, 'project_id')))
}

interface NoteQuery { source: string; projectId: string; label: string; limit: number }

function noteQuery(a: Args, maxItems: number): NoteQuery {
  const source = trimmed(a, 'source') || 'all'
  if (!['all', 'note', 'task', 'project'].includes(source)) throw new ArgError('source: must be all, note, task or project')
  return { source, projectId: trimmed(a, 'project_id'), label: trimmed(a, 'label_id'), limit: pageLimit(a, NOTE_LIST_DEFAULT, maxItems) }
}

/** Every note of the query's sources, filtered (collectNotesIn). */
async function collect(snap: Snapshot, q: NoteQuery): Promise<NoteRow[]> {
  let labels: Set<string> | null = null
  if (q.label) {
    const want = q.label.toLowerCase()
    labels = new Set(snap.labelList.filter((l) => str(l, 'id') === q.label || str(l, 'name').toLowerCase() === want).map((l) => str(l, 'id')))
  }
  const keep = (pid: string, ls: string[]) => (!q.projectId || pid === q.projectId) && (!labels || ls.some((l) => labels!.has(l)))
  const rows: NoteRow[] = []
  if (q.source === 'all' || q.source === 'note') {
    for (const n of await liveNotes(snap)) {
      const row = noteRow('note', n, 'title')
      row.projectId = str(n, 'project_id')
      row.labels = list(n, 'labels')
      if (keep(row.projectId, row.labels)) rows.push(row)
    }
  }
  if (q.source === 'all' || q.source === 'task') {
    for (const t of snap.tasks) {
      if (!visibleTask(snap, t) || !hasNote(t)) continue
      const row = noteRow('task', t, 'title')
      row.projectId = str(t, 'project_id')
      row.labels = list(t, 'labels')
      row.completed = !isOpen(t)
      if (keep(row.projectId, row.labels)) rows.push(row)
    }
  }
  if ((q.source === 'all' || q.source === 'project') && !labels) {
    for (const p of snap.projList) {
      if (!hasNote(p)) continue
      const row = noteRow('project', p, 'name')
      row.projectId = str(p, 'id')
      row.archived = p.archived === true
      if (keep(row.projectId, [])) rows.push(row)
    }
  }
  return rows
}

function out(row: NoteRow, extra: { preview?: string; snippet?: SnippetSegment[] }) {
  return {
    kind: row.kind, id: row.id, untrusted_text: { title: row.title, ...extra }, project_id: row.projectId || null, label_ids: row.labels,
    updated_at: isoTime(row.updated), encrypted: row.encrypted, ...(row.completed ? { completed: true } : {}), ...(row.archived ? { archived: true } : {}),
  }
}

const key = (r: NoteRow) => `${r.kind}:${r.id}`

function paged<T>(items: T[], limit: number): { notes: T[]; truncated?: true } {
  return { notes: items.slice(0, limit), ...(items.length > limit ? { truncated: true as const } : {}) }
}

export async function listNotes(snap: Snapshot, a: Args, _now: number, maxItems: number) {
  only(a, '', 'source', 'project_id', 'label_id', 'limit')
  const q = noteQuery(a, maxItems)
  const rows = (await collect(snap, q)).sort((x, y) => y.updated - x.updated || (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0))
  return paged(rows.map((r) => out(r, { preview: snippet(r.text, [], SNIPPET).map((s) => s.text).join('') })), q.limit)
}

export async function searchNotes(snap: Snapshot, a: Args, _now: number, maxItems: number) {
  const query = text(a, 'query', true, 500)!
  only(a, '', 'query', 'source', 'project_id', 'label_id', 'limit')
  const q = noteQuery(a, maxItems)
  const rows = await collect(snap, q)
  const byKey = new Map(rows.map((r) => [key(r), r]))
  const terms = parseQuery(query)
  const hits = rankNotes(rows.map((r) => ({ key: key(r), title: r.plainT, text: r.plainX, updated: r.updated })), query)
  return paged(hits.map((h) => {
    const row = byKey.get(h.note.key)!
    const segs = snippet(row.plainX, terms, SNIPPET)
    return out(row, segs.length ? { snippet: segs } : {})
  }), q.limit)
}

export async function getNote(snap: Snapshot, a: Args) {
  only(a, '', 'id', 'kind')
  const id = trimmed(a, 'id')
  if (!id) throw new ArgError('id: the note id is required')
  const kind = (trimmed(a, 'kind') || 'note') as Kind
  let e: Row | undefined
  let titleField = 'title'
  switch (kind) {
    case 'note': e = (await liveNotes(snap)).find((n) => str(n, 'id') === id); break
    case 'task': { const t = snap.byId.get(id); if (t && visibleTask(snap, t)) e = t; break }
    case 'project': e = snap.projects.get(id); titleField = 'name'; break
    default: throw new ArgError('kind: must be note, task or project')
  }
  if (!e) throw new ToolError('', 'note not found')
  const row = noteRow(kind, e, titleField)
  const appended = pendingAppends(e as Parameters<typeof pendingAppends>[0]).map((p) => ({ id: p.id, text: shown(p.text) }))
  const pid = kind === 'project' ? id : str(e, 'project_id')
  return {
    note: {
      kind, id, untrusted_text: { title: row.title, text: shown(str(e, 'description')), appended }, project_id: pid || null,
      label_ids: kind === 'project' ? [] : list(e, 'labels'), body_version: row.version, updated_at: isoTime(row.updated), encrypted: row.encrypted,
      ...(kind === 'task' && !isOpen(e) ? { completed: true } : {}), ...(kind === 'project' && e.archived === true ? { archived: true } : {}),
    },
  }
}
