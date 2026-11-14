// Tool sources (OpenSpec change assistant-tool-sources): what a read tool
// returned, as ids only, so the chat can show which rows came from the account
// and rows a model invents cannot pass as data. Mirrors internal/assistant SourceOf.
import type { AssistantSource } from './db'

export type { AssistantSource }

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
export const MAX_SOURCE_IDS = 50

type Row = { id?: unknown }
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((r): r is Row => !!r && typeof r === 'object') : [])

function sourceFrom(of: AssistantSource['of'], list: Row[]): AssistantSource {
  const ids: string[] = []
  for (const r of list) if (typeof r.id === 'string' && ID_RE.test(r.id) && !ids.includes(r.id)) ids.push(r.id)
  return { of, ids: ids.slice(0, MAX_SOURCE_IDS), total: ids.length }
}

/** The source of a successful read tool's result (the JSON the model receives), or null. */
export function sourceOfResult(tool: string, result: string): AssistantSource | null {
  let r: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(result)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    r = parsed as Record<string, unknown>
  } catch {
    return null
  }
  switch (tool) {
    case 'list_tasks':
    case 'search_tasks':
      return sourceFrom('tasks', rows(r.tasks))
    case 'get_task':
      return r.task && typeof r.task === 'object' ? sourceFrom('tasks', [r.task as Row]) : null
    case 'today_summary':
      return sourceFrom('tasks', [...rows(r.overdue), ...rows(r.due_today)])
    case 'list_projects':
      return sourceFrom('projects', rows(r.projects))
  }
  return null
}

/** The source of a stream event, or null when it is not a valid one (it is then skipped). */
export function sourceOf(ev: Record<string, unknown>): AssistantSource | null {
  if (ev.of !== 'tasks' && ev.of !== 'projects') return null
  const ids = Array.isArray(ev.ids) ? ev.ids.filter((x): x is string => typeof x === 'string' && ID_RE.test(x)).slice(0, MAX_SOURCE_IDS) : []
  const total = typeof ev.total === 'number' && Number.isInteger(ev.total) && ev.total >= ids.length ? ev.total : ids.length
  return { of: ev.of, ids, total }
}
