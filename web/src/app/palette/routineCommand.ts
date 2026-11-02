// "Run routine…" in the palette (OpenSpec change routines-engine, "Run a
// routine from the palette"): the live routines from local data with their
// trigger, run on the server with the open task when the routine reads one.
// The outcome is a toast with View run and Undo; offline the entries say
// "Needs a connection" and nothing runs.
import { api } from '../../lib/api'
import { t } from '../../lib/i18n'
import { uuid } from '../../lib/ids'
import { listRules } from '../../lib/rules/store'
import { checkTypes, contentStep, hasAI, readRoutine, triggerOutput, walkSteps } from '../../lib/rules/steps'
import { encryptionSnapshot } from '../../lib/e2ee'
import { getDeviceId } from '../../lib/ops'
import type { Rule, Task } from '../../lib/types'
import { showBulkToast, updateBulkToast } from '../bulk/toastStore'
import { navigate } from '../router'
import type { Step } from './entries'

/** Whether a routine reads the trigger's task (its run needs one). */
export function readsTask(rule: Pick<Rule, 'trigger' | 'condition' | 'actions' | 'steps'>): boolean {
  const kind = rule.trigger?.kind ?? ''
  if (triggerOutput(kind, !!rule.condition) !== 'task') return false
  let read: ReturnType<typeof readRoutine>
  try {
    read = readRoutine(rule.actions, rule.steps ?? null)
  } catch {
    return false
  }
  if (!read) return false
  let found = false
  walkSteps(read.steps, (s) => {
    for (const a of Object.values(s.in ?? {})) if ('ref' in a && a.ref === 'trigger') found = true
  })
  return found
}

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false

/** The toast line of a run. */
export function runSummary(name: string, run: { outcome: string; writes: number }): string {
  if (run.outcome === 'failed') return t('{name}: the run failed', { name })
  if (run.outcome === 'proposal') return t('{name}: a proposal is waiting for your review', { name })
  if (run.outcome === 'routine_changed') return t('{name}: the routine changed while it ran, nothing was written', { name })
  if (run.outcome === 'skipped' || run.outcome === 'stopped') return t('{name}: the run did not start', { name })
  return t('{name}: {n, plural, one {# item written} other {# items written}}', { name, n: run.writes })
}

/**
 * Whether Run now runs on this device: an encrypted account's routine with a
 * text or AI step (routines-ai-step D7), which the server cannot plan.
 */
export function runsOnDevice(rule: Pick<Rule, 'trigger' | 'condition' | 'actions' | 'steps'>): boolean {
  if (!encryptionSnapshot().enabled) return false
  try {
    const read = readRoutine(rule.actions, rule.steps ?? null)
    if (!read) return false
    if (hasAI(read.steps)) return true
    const trigger = triggerOutput(rule.trigger?.kind ?? '', !!rule.condition)
    return contentStep(read.steps, trigger, checkTypes(read.steps, trigger)) !== ''
  } catch {
    return false
  }
}

/** Runs a routine now and shows the outcome. */
export async function runRoutineNow(rule: Rule, task: Task | undefined): Promise<void> {
  const name = rule.name || t('Untitled routine')
  if (!online()) {
    showBulkToast(t('{name}: needs a connection', { name }), null)
    return
  }
  const taskId = readsTask(rule) ? task?.id : undefined
  const onDevice = runsOnDevice(rule)
  if (onDevice && !encryptionSnapshot().unlocked) {
    showBulkToast(t('{name}: unlock this device to run it', { name }), null)
    return
  }
  try {
    const res = onDevice
      ? await import('../../lib/rules/deviceRun').then(async (m) => m.runNowOnDevice(rule.id, uuid(), taskId, await getDeviceId()))
      : await api.runRoutine(rule.id, { run_id: uuid(), ...(taskId ? { task_id: taskId } : {}) })
    const runId = res.run.run_id
    showBulkToast(runSummary(name, res.run), null, {
      action: { label: t('View run'), run: () => navigate({ view: 'rules', id: rule.id, run: runId }) },
      ...(res.run.writes > 0 ? { second: { label: t('Undo'), run: () => {
        api.undoRoutineRun(rule.id, runId).then(
          (u) => updateBulkToast({ result: t('{restored} restored, {kept} kept because they changed after the run', { restored: u.restored, kept: u.kept }) }),
          (err: unknown) => updateBulkToast({ result: err instanceof Error ? err.message : t('The run could not be undone.') }))
      } } } : {}),
    })
  } catch (err) {
    showBulkToast(err instanceof Error ? err.message : t('The routine could not run.'), null)
  }
}

/** The picker "Run routine…" opens. */
export function runRoutineStep(task: Task | undefined): Step {
  const triggerText = (r: Rule) => ((r.trigger?.kind as string) === 'manual' ? t('Only when you run it') : t('Also runs by itself'))
  return { kind: 'picker', picker: {
    title: t('Run routine…'), placeholder: t('Find a routine…'), emptyText: t('No routines yet.'),
    source: async (query: string) => {
      const q = query.trim().toLowerCase()
      const list = (await listRules()).filter((r) => !q || (r.name ?? '').toLowerCase().includes(q))
      return { items: list }
    },
    getKey: (r: Rule) => r.id,
    getLabel: (r: Rule) => t('Run routine: {name}', { name: r.name || t('Untitled routine') }),
    getSecondary: (r: Rule) => (online() ? triggerText(r) : t('Needs a connection')),
    onPick: (r: Rule) => { void runRoutineNow(r, task) },
  } }
}
