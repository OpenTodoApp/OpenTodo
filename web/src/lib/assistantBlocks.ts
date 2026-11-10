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

/** A time or deadlines block's days: two dates in order (the server checked the span). */
const days = (ev: Record<string, unknown>): boolean => typeof ev.from === 'string' && typeof ev.to === 'string' && DATE_RE.test(ev.from) && DATE_RE.test(ev.to) && ev.from <= ev.to

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
    case 'time':
      return days(ev) && (ev.group_by === 'project' || ev.group_by === 'day') ? { kind: 'time', from: ev.from as string, to: ev.to as string, group_by: ev.group_by } : null
    case 'free_time': {
      const min = typeof ev.min_minutes === 'number' && Number.isInteger(ev.min_minutes) && ev.min_minutes >= 1 && ev.min_minutes <= 720 ? ev.min_minutes : 30
      return typeof ev.date === 'string' && DATE_RE.test(ev.date) && (ev.span === 'day' || ev.span === 'week') ? { kind: 'free_time', date: ev.date, span: ev.span, min_minutes: min } : null
    }
    case 'deadlines':
      return days(ev) ? { kind: 'deadlines', from: ev.from as string, to: ev.to as string } : null
    // The project view blocks (assistant-project-blocks).
    case 'board': {
      if (typeof ev.id !== 'string' || !ID_RE.test(ev.id)) return null
      const section = typeof ev.section_id === 'string' && ID_RE.test(ev.section_id) ? ev.section_id : ''
      return { kind: 'board', id: ev.id, ...(section ? { section_id: section } : {}) }
    }
    case 'timeline':
    case 'task':
    case 'habit':
      return typeof ev.id === 'string' && ID_RE.test(ev.id) ? { kind: ev.kind, id: ev.id } : null
    case 'activity':
      return typeof ev.id === 'string' && ID_RE.test(ev.id) && (ev.of === 'project' || ev.of === 'task') ? { kind: 'activity', of: ev.of, id: ev.id } : null
    case 'stats':
      return days(ev) ? { kind: 'stats', from: ev.from as string, to: ev.to as string } : null
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
    case 'time':
      return t('Tracked time, {date} – {date2}', { date: formatDate(b.from, 'long'), date2: formatDate(b.to, 'long') })
    case 'free_time':
      return b.span === 'day' ? t('Free time, {date}', { date: formatDate(b.date, 'long') }) : t('Free time, week of {date}', { date: formatDate(b.date, 'long') })
    case 'deadlines':
      return t('Deadlines, {date} – {date2}', { date: formatDate(b.from, 'long'), date2: formatDate(b.to, 'long') })
    case 'board':
      return t('Board')
    case 'timeline':
      return t('Timeline')
    case 'activity':
      return t('Activity')
    case 'stats':
      return t('Statistics, {date} – {date2}', { date: formatDate(b.from, 'long'), date2: formatDate(b.to, 'long') })
    case 'task':
      return t('Task')
    case 'habit':
      return t('Habit')
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
    case 'time':
    case 'free_time':
    case 'activity':
    case 'stats':
      return blockLabel(b)
    case 'board':
    case 'timeline': {
      const p = await db.projects.get(b.id)
      return live(p) ? `${blockLabel(b)}: ${p.name}` : t('Removed')
    }
    case 'task':
    case 'habit': {
      const r = await db.tasks.get(b.id)
      return live(r) ? `- [${r.completed_at ? 'x' : ' '}] ${r.title}` : t('Removed')
    }
    case 'deadlines': {
      const rows = await db.tasks.filter((r) => !r.deleted_at && !r.completed_at && !!r.deadline && r.deadline >= b.from && r.deadline <= b.to).toArray()
      rows.sort((x, y) => (x.deadline! < y.deadline! ? -1 : x.deadline! > y.deadline! ? 1 : x.title.localeCompare(y.title)))
      return [blockLabel(b), ...rows.map((r) => `- ${r.title} (${formatDate(r.deadline!, 'compact')})`)].join('\n')
    }
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
