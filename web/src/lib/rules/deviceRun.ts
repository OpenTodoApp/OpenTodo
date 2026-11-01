// A routine run on this device for an end-to-end encrypted account (OpenSpec
// change routines-ai-step, D7, D8): the server sent ids only (a routine.run
// request over the relay, or the answer of Run now on this device). The device
// plans the routine on its decrypted copy with the shared planner (lib/rules/run),
// calls its own provider for AI steps, seals every content value with the
// account key and commits through POST /api/v1/me/rules/runs/{run}/commit:
// the changes, or one sealed proposal. Inputs and outputs live in memory only
// and are dropped after the commit. Loaded lazily, on the first request.
import { api, ApiError } from '../api'
import { encryptValue } from '../crypto'
import { db } from '../db'
import { currentKey } from '../e2ee'
import { sealValue } from '../e2eeEnvelope'
import type { RoutineRunRequest } from '../relay'
import type { Entity, Rule } from '../types'
import { completeOnDevice, deviceAIReady, DeviceAIError } from './deviceAI'
import { NOTICE_BINDING, PROPOSAL_BINDING, type DeviceChange, type DeviceCommit, type DeviceSide, type DeviceStepRecord } from './deviceTypes'
import { AIError, planRoutine, proposalItems, type MergedChange, type RunPlan, type RunWorld, type SideSpec, type StepRecord } from './run'
import { loadRunWorld } from './run/load'
import { hasAI, readRoutine } from './steps'

/** What a device run did, for this device's list of recent runs (no text). */
export interface DeviceRunOutcome {
  name: string
  outcome: string
  writes: number
}

/** The step records as the server keeps them: ids, counts, statuses, codes. */
export function wireSteps(records: readonly StepRecord[]): DeviceStepRecord[] {
  return records.map((r) => ({ step_id: r.step_id, kind: r.kind, status: r.status, duration_ms: Math.max(0, Math.round(r.duration_ms)), items: r.items,
    output: r.output, ids: r.ids.slice(0, 50), ...(r.error ? { error: r.error } : {}), ...(r.tokens ? { tokens: r.tokens } : {}) }))
}

/** One change with its content fields sealed for its entity, id and field. */
export async function sealChange(key: CryptoKey, c: MergedChange): Promise<DeviceChange> {
  const fields: Record<string, unknown> = {}
  for (const [f, v] of Object.entries(c.patch)) fields[f] = await sealValue(key, c.entity as Entity, c.id, f, v)
  return { entity: c.entity, id: c.id, ...(c.create ? { create: true } : {}), fields }
}

/** The side effects a device run sends: a notice's text sealed to the run and step; email and webhook text never leave. */
export async function sealSides(key: CryptoKey, runId: string, sides: readonly SideSpec[]): Promise<DeviceSide[]> {
  const out: DeviceSide[] = []
  for (const s of sides) {
    if (s.kind === 'notify' && s.notice) {
      const text = s.notice.text ? await encryptValue(key, NOTICE_BINDING.entity, runId, s.notice.stepId, s.notice.text) : undefined
      out.push({ kind: 'notify', step: s.notice.stepId, ...(text ? { text } : {}), ...(s.notice.taskId ? { task: s.notice.taskId } : {}) })
    } else if (s.kind === 'fired' && s.fired?.taskId) {
      out.push({ kind: 'fired', task: s.fired.taskId })
    } else if (s.kind === 'webhook' && s.delivery && s.hook && s.delivery.Text === null) {
      out.push({ kind: 'webhook', step: s.delivery.StepID, webhook: s.hook, tasks: s.delivery.TaskIDs })
    } else {
      throw new Error('encrypted')
    }
  }
  return out
}

/** The proposal's body as one envelope, bound to its run (any device with the key opens it). */
export async function sealProposal(key: CryptoKey, runId: string, world: RunWorld, plan: RunPlan): Promise<{ envelope: string; items: number }> {
  const items = proposalItems(world, plan)
  const body = JSON.stringify({ items, changes: plan.changes, completing: plan.completing })
  return { envelope: await encryptValue(key, PROPOSAL_BINDING.entity, runId, PROPOSAL_BINDING.field, body), items: items.length }
}

/** The failed step's code: its record's error, else the plan's reason as a code. */
function failCode(plan: RunPlan): string {
  const rec = plan.records.find((r) => r.index === plan.failedStep) ?? plan.records.find((r) => r.status === 'failed')
  const code = rec?.error ?? ''
  return /^[a-z][a-z0-9_:]{0,63}$/.test(code) ? code : 'step_failed'
}

/** Runs one routine.run request on this device and commits its result. */
export async function runOnDevice(req: RoutineRunRequest, onStart: (name: string) => void = () => undefined): Promise<DeviceRunOutcome> {
  const key = await currentKey()
  // Locked: leave the run waiting for this or another device.
  if (!key) return { name: '', outcome: 'locked', writes: 0 }
  const rule = (await db.rules.get(req.rule)) as Rule | undefined
  const started = Date.now()
  if (!rule) {
    await api.failDeviceRun(req.run, { step: -1, code: 'not_found' }).catch(() => undefined)
    return { name: '', outcome: 'failed', writes: 0 }
  }
  const name = rule.name ?? ''
  onStart(name)
  const read = readRoutine(rule.actions, rule.steps ?? null)
  if (!read) {
    await api.failDeviceRun(req.run, { step: -1, code: 'invalid_argument' }).catch(() => undefined)
    return { name, outcome: 'failed', writes: 0 }
  }
  const steps = read.steps
  const withAI = hasAI(steps)
  const ai = withAI && (await deviceAIReady())
  const prefs = await db.userPrefs.get('me')
  const world = await loadRunWorld({ steps, encrypted: true, env: { ai, aiConsent: ai, energy: (prefs as { energy?: string } | undefined)?.energy === 'on' } })
  const plan = await planRoutine(world, { id: rule.id, name, steps, trigger: (rule.trigger ?? { kind: 'manual' }) as RunRoutineTrigger, condition: rule.condition ?? null, aiBudget: req.budget },
    { key: req.occurrence, runId: req.run, triggerTaskId: req.task, aiTokensToday: req.tokens,
      ai: async (c) => {
        try {
          return await completeOnDevice(c)
        } catch (err) {
          throw err instanceof DeviceAIError ? new AIError(err.code, err.message) : err
        }
      } })
  const base = { steps: wireSteps(plan.records), duration_ms: Date.now() - started, tokens: plan.tokens }
  if (plan.outcome === 'failed' || plan.outcome === 'stopped') {
    await api.failDeviceRun(req.run, { step: plan.failedStep, code: failCode(plan), ...base })
    return { name, outcome: 'failed', writes: 0 }
  }
  const outcome = plan.outcome === 'ended' || plan.outcome === 'already_matched' ? plan.outcome : 'applied'
  const propose = async () => {
    const res = await api.commitDeviceRun(req.run, { ...base, proposal: await sealProposal(key, req.run, world, plan) })
    return { name, outcome: res.run.outcome, writes: 0 }
  }
  if (plan.writesPlanned === 0) {
    const res = await api.commitDeviceRun(req.run, { ...base, outcome })
    return { name, outcome: res.run.outcome, writes: 0 }
  }
  // A routine with an AI step writes only in auto mode, within its limits,
  // which the server checks (and records its fallback); else it is a proposal (D2, D4, D5).
  if (withAI && !req.auto) return propose()
  let commit: DeviceCommit
  try {
    commit = { ...base, outcome, changes: await Promise.all(plan.changes.map((c) => sealChange(key, c))), completing: plan.completing, sides: await sealSides(key, req.run, plan.sides) }
  } catch {
    await api.failDeviceRun(req.run, { step: -1, code: 'encrypted', ...base })
    return { name, outcome: 'failed', writes: 0 }
  }
  try {
    const res = await api.commitDeviceRun(req.run, commit)
    return { name, outcome: res.run.outcome, writes: res.run.writes }
  } catch (err) {
    // Auto mode's limits: the server recorded the fallback; the run becomes a proposal.
    if (err instanceof ApiError && err.code === 'fallback') return propose()
    if (err instanceof ApiError && err.code === 'routine_changed') return { name, outcome: 'routine_changed', writes: 0 }
    throw err
  }
}

type RunRoutineTrigger = Parameters<typeof planRoutine>[1]['trigger']

/** Run now on this device (D7): the server records the run for this device, which plans and commits it here. */
export async function runNowOnDevice(ruleId: string, runId: string, taskId: string | undefined, device: string): Promise<{ run: { run_id: string; outcome: string; writes: number }; local: DeviceRunOutcome | null }> {
  const res = await api.runRoutine(ruleId, { run_id: runId, ...(taskId ? { task_id: taskId } : {}), device })
  if (!res.device_run) return { run: res.run, local: null }
  const local = await runOnDevice(res.device_run)
  return { run: { run_id: res.run.run_id, outcome: local.outcome, writes: local.writes }, local }
}
