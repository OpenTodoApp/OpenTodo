// Blocks in the assistant's answers (OpenSpec change assistant-generative-ui, D3,
// D4): reading a block event, where blocks sit in an answer's text, the label a
// block is announced and named by, and an answer as plain Markdown for Copy. A
// block holds ids and parameters only; content always comes from the device's rows.
import { db, type AssistantBlock, type AssistantMessage } from './db'
import { formatDate } from './dates'
import { t } from './i18n'

export type { AssistantBlock }

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_IDS = 20

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && ID_RE.test(x)).slice(0, MAX_IDS) : [])
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** The block of a stream event, or null when it is not one this app knows (it is then skipped). */
export function blockOf(ev: Record<string, unknown>): AssistantBlock | null {
  switch (ev.kind) {
    case 'tasks': {
      const list = ids(ev.ids)
      const title = text(ev.title, 80)
      return list.length ? { kind: 'tasks', ids: list, ...(title ? { title } : {}) } : null
    }
    case 'calendar':
      return typeof ev.date === 'string' && DATE_RE.test(ev.date) && (ev.span === 'day' || ev.span === 'week') ? { kind: 'calendar', date: ev.date, span: ev.span } : null
    case 'choice': {
      const question = text(ev.question, 200)
      const options = Array.isArray(ev.options) ? ev.options.map((o) => text(o, 60)).filter(Boolean).slice(0, 4) : []
      return question && options.length >= 2 ? { kind: 'choice', question, options } : null
    }
    case 'map': {
      const taskIds = ids(ev.task_ids)
      const placeIds = ids(ev.place_ids)
      return taskIds.length + placeIds.length ? { kind: 'map', task_ids: taskIds, place_ids: placeIds } : null
    }
    case 'note':
    case 'project':
      return typeof ev.id === 'string' && ID_RE.test(ev.id) ? { kind: ev.kind, id: ev.id } : null
  }
  return null
}

/** The answer's text cut at its blocks: Markdown parts and blocks in reading order. */
export type AnswerPart = { kind: 'text'; text: string } | { kind: 'block'; block: AssistantBlock; index: number }

export function splitAnswer(source: string, blocks: AssistantMessage['blocks']): AnswerPart[] {
  if (!blocks?.length) return source ? [{ kind: 'text', text: source }] : []
  const out: AnswerPart[] = []
  let from = 0
  const placed = blocks.map((b, index) => ({ ...b, index, at: Math.max(0, Math.min(source.length, b.at)) })).sort((a, b) => a.at - b.at || a.index - b.index)
  for (const b of placed) {
    if (b.at > from) out.push({ kind: 'text', text: source.slice(from, b.at) })
    from = Math.max(from, b.at)
    out.push({ kind: 'block', block: b.block, index: b.index })
  }
  if (from < source.length) out.push({ kind: 'text', text: source.slice(from) })
  return out.filter((p) => p.kind === 'block' || p.text.trim())
}

/** The name a block is announced and labelled by, from its parameters alone. */
export function blockLabel(b: AssistantBlock): string {
  switch (b.kind) {
    case 'tasks':
      return t('{n, plural, one {# task} other {# tasks}}', { n: b.ids.length })
    case 'calendar':
      return b.span === 'day' ? t('Calendar, {date}', { date: formatDate(b.date, 'long') }) : t('Week of {date}', { date: formatDate(b.date, 'long') })
    case 'choice':
      return t('Choice: {question}', { question: b.question })
    case 'map':
      return t('{n, plural, one {Map, # place} other {Map, # places}}', { n: (b.task_ids?.length ?? 0) + (b.place_ids?.length ?? 0) })
    case 'note':
      return t('Note')
    case 'project':
      return t('Project outline')
  }
}

const live = <T extends { deleted_at?: number | null }>(r: T | undefined): r is T => !!r && !r.deleted_at

/** A block as plain text (Copy, D8), from the device's rows at the time of copying. */
export async function blockText(b: AssistantBlock): Promise<string> {
  switch (b.kind) {
    case 'tasks': {
      const rows = (await db.tasks.bulkGet(b.ids)).filter(live)
      return [b.title, ...rows.map((r) => `- [${r.completed_at ? 'x' : ' '}] ${r.title}`)].filter(Boolean).join('\n')
    }
    case 'calendar':
      return blockLabel(b)
    case 'choice':
      return [b.question, ...b.options.map((o) => `- ${o}`)].join('\n')
    case 'map': {
      const [tasks, places] = await Promise.all([db.tasks.bulkGet(b.task_ids ?? []), db.places.bulkGet(b.place_ids ?? [])])
      return [...tasks.filter(live).map((r) => `- ${r.title}`), ...places.filter(live).map((p) => `- ${p.name}${p.address ? `, ${p.address}` : ''}`)].join('\n')
    }
    case 'note': {
      const n = await db.notes.get(b.id)
      return live(n) ? n.title || t('Untitled note') : t('Removed')
    }
    case 'project': {
      const p = await db.projects.get(b.id)
      return live(p) ? p.name : t('Removed')
    }
  }
}

/** An answer as Markdown, each block written as plain text where it was (Copy, D8). */
export async function answerMarkdown(m: Pick<AssistantMessage, 'text' | 'blocks'>): Promise<string> {
  const parts = await Promise.all(splitAnswer(m.text, m.blocks).map((p) => (p.kind === 'text' ? p.text.trim() : blockText(p.block))))
  return parts.filter(Boolean).join('\n\n')
}
