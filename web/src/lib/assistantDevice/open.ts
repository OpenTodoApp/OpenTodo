// Proposals that grow over turns on the device (OpenSpec change
// assistant-proposal-editing, design D3): internal/assistant open.go and
// agenttools OpenProposal in the browser. The open proposal is checked against
// this device's rows (pinned by open.vectors.json), seeds the draft, is listed in
// the instructions and can lose items through drop_from_proposal.
import type { ProposedChange } from '../assistantTypes'
import { OP_DEFAULTS } from '../../generated/opSchema'
import { fieldValueId } from '../ops'
import { isDeleted, liveRows, str, visibleTask, type Snapshot } from './data'
import { manifest } from './manifest'

const OPEN_ENTITIES = new Set(['task', 'project', 'section', 'label', 'comment', 'reminder', 'note'])
const ID_RE = /^[A-Za-z0-9._:@+=~-]{1,64}$/

/** Whether every field is one the entity's op schema has (the server also checks each value's kind). */
function knownFields(c: ProposedChange): boolean {
  const fields = (OP_DEFAULTS as Record<string, Record<string, unknown>>)[c.entity] ?? {}
  const ok = (f: string) => f in fields || (c.entity === 'task' && fieldValueId(f) !== null)
  return Object.keys(c.patch).every(ok) && Object.keys(c.base ?? {}).every(ok)
}

/** The items of an open proposal this device's assistant may plan on, in order (Registry.OpenProposal). */
export async function checkOpen(items: readonly ProposedChange[] | undefined, snap: Snapshot): Promise<ProposedChange[]> {
  if (!items?.length) return []
  const visible: Record<string, Set<string>> = {
    task: new Set(snap.tasks.filter((t) => visibleTask(snap, t)).map((t) => str(t, 'id'))),
    project: new Set(snap.projects.keys()),
    section: new Set([...snap.sections.entries()].filter(([, s]) => snap.projects.has(str(s, 'project_id')) || !str(s, 'project_id')).map(([id]) => id)),
    label: new Set(snap.labels.keys()),
    note: new Set((await liveRows('notes')).filter((n) => !isDeleted(n) && (!str(n, 'project_id') || snap.projects.has(str(n, 'project_id')))).map((n) => str(n, 'id'))),
  }
  const seen = new Set<string>()
  const kept: ProposedChange[] = []
  for (const c of items) {
    const key = `${c.entity}\u0000${c.entityId}`
    if (!OPEN_ENTITIES.has(c.entity) || seen.has(key) || !ID_RE.test(c.entityId) || !c.patch || !Object.keys(c.patch).length || !knownFields(c)) continue
    const known = !!visible[c.entity]?.has(c.entityId)
    if (!!c.create === known) continue
    seen.add(key)
    kept.push({ entity: c.entity, entityId: c.entityId, ...(c.create ? { create: true } : {}), patch: c.patch, ...(c.base ? { base: c.base } : {}) })
  }
  return kept
}

/** One item as the instructions list it (openLine): compact JSON, its values in field order. */
export function openLine(c: ProposedChange): string {
  const set = Object.fromEntries(Object.keys(c.patch).sort().map((f) => [f, c.patch[f]]))
  return JSON.stringify({ entity: c.entity, id: c.entityId, ...(c.create ? { new: true } : {}), set })
}

/** The open proposal in the instructions (openSection). */
export function openSection(open: readonly ProposedChange[]): string {
  if (!open.length) return ''
  return `\n\n${manifest.open_proposal.note}\n${open.map(openLine).join('\n')}\n`
}

/** drop_from_proposal (dropFromDraft): every change to a named item leaves the draft. */
export function dropFromDraft(draft: ProposedChange[], args: Record<string, unknown>): { content: string; isError: boolean; draft: ProposedChange[] } {
  const max = manifest.open_proposal.max_items
  const ids = Array.isArray(args.ids) ? args.ids : []
  if (!ids.length || ids.length > max || ids.some((x) => typeof x !== 'string')) {
    return { content: JSON.stringify({ error: 'invalid_arguments', message: `ids holds 1 to ${max} ids of items in the open proposal` }), isError: true, draft }
  }
  const drop = new Set(ids as string[])
  const found = new Set<string>()
  const kept = draft.filter((c) => (drop.has(c.entityId) ? (found.add(c.entityId), false) : true))
  const out: Record<string, unknown> = { dropped: found.size, status_note: 'Removed from the proposal; the user reviews what is left.' }
  if (drop.size > found.size) out.not_in_proposal = drop.size - found.size
  return { content: JSON.stringify(out), isError: false, draft: kept }
}
