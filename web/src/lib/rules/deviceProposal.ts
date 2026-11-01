// An encrypted account's proposal (OpenSpec change routines-ai-step, D3): the
// device that ran the routine sealed its body as one envelope bound to the run;
// any device with the account key opens it, the person reviews it, and the
// device re-checks the ticked items against its own copy, seals them and sends
// them to the apply route, which writes them like a commit.
import { api } from '../api'
import { decryptValue } from '../crypto'
import { db } from '../db'
import type { RoutineProposal, RoutineProposalApplied, RoutineProposalItem } from '../types'
import { sealChange, sealSides } from './deviceRun'
import { PROPOSAL_BINDING } from './deviceTypes'
import type { MergedChange, SideSpec } from './run'

/** The opened body of an encrypted proposal. */
export interface ProposalBody {
  items: RoutineProposalItem[]
  changes: MergedChange[]
  completing: string[]
}

/** Opens an encrypted proposal's envelope with the account key (throws when it does not open). */
export async function openProposal(key: CryptoKey, p: Pick<RoutineProposal, 'run_id' | 'envelope'>): Promise<ProposalBody> {
  if (!p.envelope) throw new Error('no envelope')
  const body = JSON.parse(await decryptValue(key, PROPOSAL_BINDING.entity, p.run_id, PROPOSAL_BINDING.field, p.envelope)) as Partial<ProposalBody>
  return { items: Array.isArray(body.items) ? body.items : [], changes: Array.isArray(body.changes) ? body.changes : [], completing: Array.isArray(body.completing) ? body.completing : [] }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Why an item can no longer be applied on this device's copy: deleted, changed, or "" (the server's stale). */
export async function staleOnDevice(it: RoutineProposalItem): Promise<'' | 'deleted' | 'changed'> {
  if (it.kind === 'create' || !it.entity || !it.id) return ''
  const table = { task: db.tasks, project: db.projects, label: db.labels, section: db.sections }[it.entity as 'task' | 'project' | 'label' | 'section']
  if (!table) return ''
  const row = (await table.get(it.id)) as Record<string, unknown> | undefined
  if (!row || (row.deleted_at !== null && row.deleted_at !== undefined && row.deleted_at !== 0)) return 'deleted'
  for (const [f, before] of Object.entries(it.before ?? {})) if (!same(before, row[f])) return 'changed'
  return ''
}

/** Applies the ticked items of an opened proposal. */
export async function applyOpened(key: CryptoKey, p: Pick<RoutineProposal, 'id' | 'run_id'>, body: ProposalBody, keys: readonly string[]): Promise<RoutineProposalApplied> {
  const ticked = new Set(keys)
  const keep = new Set<string>()
  const sides: SideSpec[] = []
  let skipped = body.items.length - body.items.filter((it) => ticked.has(it.key)).length
  let changed = 0
  for (const it of body.items) {
    if (!ticked.has(it.key)) continue
    if (it.side) {
      sides.push(it.side as SideSpec)
      continue
    }
    const why = await staleOnDevice(it)
    if (why) {
      skipped++
      if (why === 'changed') changed++
      continue
    }
    keep.add(`${it.entity}\u0000${it.id}`)
  }
  const changes = await Promise.all(body.changes.filter((c) => keep.has(`${c.entity}\u0000${c.id}`)).map((c) => sealChange(key, c)))
  const completing = body.completing.filter((id) => keep.has(`task\u0000${id}`))
  return api.applyEncryptedProposal(p.id, { changes, completing, sides: await sealSides(key, p.run_id, sides), skipped, changed })
}
