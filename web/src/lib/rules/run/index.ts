// The device's routine planner (OpenSpec change routines-ai-step, design D7):
// a faithful port of internal/rules' routine runner, so a device of an
// end-to-end encrypted account plans a routine on its decrypted copy exactly as
// the server would plan it on plaintext. web/src/lib/rules/usecases.json runs
// through both (run/usecases.test.ts and internal/rules/usecases_test.go).
//
// planRoutine(world, rule, opts) plans every step and writes nothing; the
// caller decides what the plan becomes: a commit of plan.changes (with the
// completion companions of plan.completing), or, for a routine with AI steps
// not in effective auto mode or when autoCheck refuses, a proposal of
// proposalItems(world, plan). Created ids are the server's (client_request_id
// seeds of the routine caller rule:<rule-id>), so the device and the server
// name the same entities for the same run. Pure: no Dexie, no network; AI
// calls go through opts.ai. Loaded lazily: nothing on the startup path imports it.
import { inFindScope } from '../stepData'
import { isNull } from './actions'
import { mergeChanges } from './review'
import { Ended, RunState, StepFail, str, tasksVal } from './state'
import type { RunOptions, RunPlan, RunRoutine, RunWorld } from './types'
import type { StepValue } from '../stepData'

export { autoCheck, mergeChanges, proposalItems } from './review'
export { planActions, parseActions, parseStepActions } from './actions'
export { AIError } from './types'
export type { AIAnswer, AICall, Change, LibraryTemplate, MergedChange, ProposalItem, Row, RunEnv, RunOptions, RunPlan, RunRoutine, RunWorld, SideSpec, StepRecord } from './types'

/** The trigger's output for an occurrence (internal/rules triggerValue). */
export function triggerValue(st: RunState, taskId?: string): StepValue {
  const r = st.r
  if (r.trigger.kind === 'schedule') {
    if (!r.condition) return { type: 'date', date: st.w.today }
    const scope = new Map<string, boolean>()
    for (const [id, p] of st.projects) if (isNull(p.deleted_at)) scope.set(id, p.archived === true)
    const ids: string[] = []
    for (const [id, t] of st.tasks) {
      if (isNull(t.deleted_at) && isNull(t.completed_at) && inFindScope({ deleted_at: null, project_id: str(t, 'project_id') || null }, scope, false) && st.matchCond(r.condition, t)) ids.push(id)
    }
    ids.sort()
    return tasksVal(ids.slice(0, 500))
  }
  return taskId ? { type: 'task', id: taskId } : { type: 'task' }
}

/** Plans one occurrence of a routine; nothing is written. */
export async function planRoutine(world: RunWorld, rule: RunRoutine, opts: RunOptions): Promise<RunPlan> {
  const st = new RunState(world, rule, opts)
  st.trigger = triggerValue(st, opts.triggerTaskId)
  const { failed, err } = await st.plan()
  const changes = mergeChanges(st.overlay)
  const base: RunPlan = {
    outcome: 'applied', failedStep: -1, records: st.records, overlay: st.overlay, changes, completing: [...st.completing].sort(),
    sides: st.sides, aiTexts: st.aiTexts, tokens: st.aiTokens, writesPlanned: st.writesPlanned(),
  }
  if (st.test) base.previews = st.previews
  if (err && !(err instanceof Ended)) {
    if (!(err instanceof StepFail)) throw err
    return { ...base, outcome: 'failed', reason: err.message, failedStep: failed }
  }
  if (err instanceof Ended) return { ...base, outcome: 'ended' }
  if (base.writesPlanned === 0) return { ...base, outcome: 'already_matched' }
  return base
}
