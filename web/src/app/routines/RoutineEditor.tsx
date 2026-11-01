// The routine editor (OpenSpec change routines-editor, design D1-D8, D13): the
// When card and one sentence card per step in one column, phone first (a
// full-screen page below 640 px, a wide dialog above); + Add step, live
// previews, type errors with one-tap fixes, Test (a logged test run for a saved
// routine, the draft route otherwise), Save as operations (offline included)
// and, for a saved routine, Run now and its History tab. Every edit is one undo
// step (Ctrl+Z). Loaded lazily with the Routines page.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { api } from '../../lib/api'
import { messageOf } from '../../lib/errorText'
import { t } from '../../lib/i18n'
import { uuid } from '../../lib/ids'
import { useOnline } from '../../lib/online'
import { useCatalogue } from '../../lib/rules/catalogue'
import {
  draftError, draftOf, draftTypes, duplicateStep, findStep, insertStep, moveStep, newId, newStep, NEW_ROUTINE, placeOf, removeStep, sameDraft, setInput, stepCount, stepNumber, storedOf,
  type RoutineDraft,
} from '../../lib/rules/draft'
import { errorText, fixFor, type Fix } from '../../lib/rules/fixes'
import { planDraft, serverPreview, type Preview } from '../../lib/rules/preview'
import { outputNames, stepName } from '../../lib/rules/sentence'
import { createRule, updateRule } from '../../lib/rules/store'
import { contentStep, MAX_STEPS, triggerOutput } from '../../lib/rules/steps'
import { useEncryption } from '../../lib/e2ee'
import { useMe } from '../../lib/timeEntries'
import type { RoutineStepType, Rule, RoutineTestResult } from '../../lib/types'
import { Button, ConfirmDialog, Dialog, Field, Input, Notice, Tabs } from '../../ui'
import { runRoutineNow } from '../palette/routineCommand'
import { AddStepSheet } from './AddStep'
import { usePreviewData, useRoutineNames, valueNamer } from './data'
import type { RuleDraft } from './ruleDraft'
import { RunDetail, RunsList } from './RunHistory'
import { CardColumn, sentenceText, WhenCard, type CardEvents, type CardState } from './StepCard'

/** A rule draft (a board conversion) as a routine draft: one Change tasks card. */
export function routineDraftOf(d: RuleDraft): RoutineDraft {
  return draftOf({ name: d.name, trigger: d.trigger, condition: d.condition, actions: Object.keys(d.actions).length ? d.actions : { priority: 4 }, steps: null })
}

/** Where "+ Add step" inserts: below a card, or at the end of a list. */
type AddTarget = { parent: string; block: 'then' | 'otherwise' | 'do' | ''; index: number; above: RoutineStepType | 'start' }

/** The draft with undo (one edit is one step back). */
function useDraft(start: RoutineDraft) {
  const [state, setState] = useState({ draft: start, past: [] as RoutineDraft[] })
  const edit = useCallback((fn: (d: RoutineDraft) => RoutineDraft) => setState((s) => {
    const next = fn(s.draft)
    return next === s.draft ? s : { draft: next, past: [...s.past.slice(-49), s.draft] }
  }), [])
  const undo = useCallback(() => setState((s) => (s.past.length ? { draft: s.past[s.past.length - 1], past: s.past.slice(0, -1) } : s)), [])
  return { draft: state.draft, edit, undo, canUndo: state.past.length > 0 }
}

/** Server previews for the steps the device cannot plan (D4), debounced 400 ms. */
function useServerPreview(draft: RoutineDraft, local: Map<string, Preview>, ok: boolean, taskId: string | undefined, online: boolean): Map<string, Preview> | null {
  const [res, setRes] = useState<Map<string, Preview> | null>(null)
  const needs = [...local.values()].some((p) => p.state === 'server')
  const key = JSON.stringify([draft.trigger, draft.condition, draft.steps, taskId])
  useEffect(() => {
    setRes(null)
    if (!online || !ok || !needs || !draft.steps.length) return
    let live = true
    const timer = setTimeout(() => {
      api.testRoutineDraft({ trigger: draft.trigger, condition: draft.condition, steps: draft.steps, ...(taskId ? { task_id: taskId } : {}) }).then((r) => {
        if (!live) return
        setRes(new Map(r.steps.map((x) => [x.step_id, serverPreview(x)])))
      }, () => undefined)
    }, 400)
    return () => { live = false; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, online, ok, needs])
  return res
}

function TestResult({ result, draft, names }: { result: RoutineTestResult; draft: RoutineDraft; names: ReturnType<typeof useRoutineNames> }) {
  const outputs = outputNames(draft.steps, valueNamer(names))
  const ctx = { draft, types: draftTypes(draft), outputs, names }
  const ok = result.run.outcome !== 'failed'
  return (
    <section className="surface-card space-y-2 p-3" aria-label={t('Test')} data-test-result={result.run.outcome}>
      <p className={`text-body ${ok ? 'text-default' : 'text-danger'}`}>
        {ok ? t('{n, plural, one {Test finished: would write # item, nothing was written} other {Test finished: would write # items, nothing was written}}', { n: result.writes })
          : t('Test failed at step {n}, nothing was written', { n: result.run.failed_step + 1 })}
      </p>
      <ol className="space-y-1 text-meta text-muted">
        {result.steps.map((r) => {
          const s = findStep(draft.steps, r.step_id)
          return <li key={r.step_id} data-test-step={r.status}>{s ? sentenceText(s, ctx) : r.kind} · {r.status === 'ok' ? t('Done') : r.status}{r.error ? ` · ${r.error}` : ''}</li>
        })}
      </ol>
    </section>
  )
}

/** The editor over a rule draft made from a view or a board column, naming the filter terms it could not carry over. */
export function RuleDraftEditor({ draft, onClose }: { draft: RuleDraft; onClose: () => void }) {
  return <RoutineEditor draft={routineDraftOf(draft)} dropped={draft.dropped} onClose={onClose} />
}

export function RoutineEditor({ rule, draft: initial, dropped, onClose }: { rule?: Rule; draft?: RoutineDraft; dropped?: string[]; onClose: () => void }) {
  const start = useMemo(() => (rule ? draftOf(rule) : initial ?? NEW_ROUTINE), [rule, initial])
  const { draft, edit, undo, canUndo } = useDraft(start)
  const me = useMe() ?? ''
  const online = useOnline()
  const names = useRoutineNames()
  const catalogue = useCatalogue()
  const [tab, setTab] = useState('steps')
  const [adding, setAdding] = useState<AddTarget | null>(null)
  const [saveError, setSaveError] = useState('')
  const [discard, setDiscard] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<RoutineTestResult | null>(null)
  const [announce, setAnnounce] = useState('')
  const [openRun, setOpenRun] = useState<string | null>(null)
  const focusAfter = useRef<string | null>(null)
  const openers = useRef(new Map<string, () => void>()).current

  const types = useMemo(() => draftTypes(draft), [draft])
  const outputs = useMemo(() => outputNames(draft.steps, valueNamer(names)), [draft.steps, names])
  const ctx = useMemo(() => ({ draft, types, outputs, names }), [draft, types, outputs, names])
  const error = useMemo(() => draftError(draft), [draft])
  const triggerType = triggerOutput(draft.trigger.kind, !!draft.condition)
  const data = usePreviewData(draft.condition, triggerType === 'task' && draft.trigger.kind !== 'manual', me)
  const local = useMemo(() => planDraft(draft, data), [draft, data])
  const server = useServerPreview(draft, local, !error, data.triggerTask?.id, online)
  const previews = useMemo(() => {
    if (!server) return local
    const out = new Map(local)
    for (const [id, p] of local) if (p.state === 'server' && server.has(id)) out.set(id, server.get(id)!)
    return out
  }, [local, server])
  const shownError = error ? { step: error.step, input: error.input, text: errorText(draft, error, outputs), fix: fixFor(draft, error) } : null
  const dirty = !sameDraft(start, draft)

  // Focus stays on a moved card (D13).
  useEffect(() => {
    const id = focusAfter.current
    if (!id) return
    focusAfter.current = null
    document.querySelector<HTMLElement>(`[data-step-card="${id}"]`)?.focus()
  }, [draft])

  const events: CardEvents = {
    set: (id, input, arg) => edit((d) => ({ ...d, steps: setInput(d.steps, id, input, arg) })),
    edit,
    move: (id, delta) => {
      const s = findStep(draft.steps, id)
      const next = moveStep(draft.steps, id, delta)
      if (!next || !s) return
      focusAfter.current = id
      edit((d) => ({ ...d, steps: next }))
      setAnnounce(delta < 0 ? t('Moved up: {step}', { step: stepName(s.kind) }) : t('Moved down: {step}', { step: stepName(s.kind) }))
    },
    duplicate: (id) => edit((d) => (stepCount(d.steps) >= MAX_STEPS ? d : { ...d, steps: duplicateStep(d.steps, id) })),
    remove: (id) => edit((d) => ({ ...d, steps: removeStep(d.steps, id) })),
    addBelow: (id) => {
      const p = placeOf(draft.steps, id)
      if (p) setAdding({ parent: p.parent, block: p.block, index: p.index + 1, above: types[id] ?? 'none' })
    },
    addIn: (parent, block) => {
      const holder = findStep(draft.steps, parent)
      const list = (holder?.[block] ?? [])
      const last = list[list.length - 1]
      setAdding({ parent, block, index: -1, above: last ? types[last.id] ?? 'none' : 'start' })
    },
    fix: (f: Fix) => {
      if (f.kind === 'edit') edit(f.apply)
      else openers.get(`${f.step}.${f.input}`)?.()
    },
  }
  const addAtEnd = () => {
    const last = draft.steps[draft.steps.length - 1]
    setAdding({ parent: '', block: '', index: -1, above: last ? types[last.id] ?? 'none' : 'start' })
  }
  const pick = (kind: string) => {
    if (!adding) return
    const target = adding
    setAdding(null)
    edit((d) => {
      if (stepCount(d.steps) >= MAX_STEPS) return d
      const id = newId(d.steps)
      // The step above: the one before the insertion point in its list.
      const holder = target.parent ? findStep(d.steps, target.parent) : null
      const list = target.parent ? ((holder?.[target.block as 'then'] ?? []) as typeof d.steps) : d.steps
      const at = target.index < 0 ? list.length : target.index
      const prev = list[at - 1]
      const above = prev && types[prev.id] && types[prev.id] !== 'none' ? { id: prev.id, type: types[prev.id] } : undefined
      focusAfter.current = id
      return { ...d, steps: insertStep(d.steps, target, newStep(kind, id, above)) }
    })
  }
  const blocked = error && error.code !== 'unavailable' ? error : null
  const save = () => {
    setSaveError('')
    const name = draft.name.trim()
    if (!name) { setSaveError(t('A routine needs a name')); return }
    if (!draft.steps.length) { setSaveError(t('A routine needs at least one step')); return }
    if (blocked) { setSaveError(t('Fix step {n} first', { n: stepNumber(draft.steps, blocked.step) || 1 })); return }
    if (rule && !dirty) { onClose(); return }
    const stored = storedOf(draft)
    const done = rule
      ? updateRule(rule.id, { name, trigger: draft.trigger, condition: draft.condition, ...stored })
      : createRule({ name, trigger: draft.trigger, condition: draft.condition, ...stored })
    Promise.resolve(done).then(onClose, (e: unknown) => setSaveError(messageOf(e)))
  }
  const test = () => {
    if (!online || blocked || !draft.steps.length) return
    setTesting(true)
    setResult(null)
    const taskId = triggerType === 'task' ? data.triggerTask?.id : undefined
    const req = rule && !dirty
      ? api.testRoutine(rule.id, { run_id: uuid(), ...(taskId ? { task_id: taskId } : {}) })
      : api.testRoutineDraft({ trigger: draft.trigger, condition: draft.condition, steps: draft.steps, ...(taskId ? { task_id: taskId } : {}) })
    req.then((r) => {
      setResult(r)
      setAnnounce(r.run.outcome === 'failed' ? t('Test failed at step {n}, nothing was written', { n: r.run.failed_step + 1 }) : t('{n, plural, one {Test finished: would write # item, nothing was written} other {Test finished: would write # items, nothing was written}}', { n: r.writes }))
    }, (e: unknown) => setSaveError(messageOf(e))).finally(() => setTesting(false))
  }
  const close = () => (dirty ? setDiscard(true) : onClose())
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key === 'Enter' && e.shiftKey) { e.preventDefault(); test() }
    else if (mod && e.key === 'Enter') { e.preventDefault(); save() }
    else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey && canUndo && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); undo() }
  }
  const state: CardState = { ctx, catalogue, previews, online, error: shownError, me, openers }
  const steps = (
    <div className="mx-auto w-full max-w-[44rem] space-y-2">
      {draft.steps.length === 0 && <p className="text-meta text-muted">{t('Add the first step: what should happen?')}</p>}
      <CardColumn steps={draft.steps} state={state} events={events} onAdd={addAtEnd}>
        <WhenCard trigger={draft.trigger} condition={draft.condition} ctx={ctx} me={me}
          onTrigger={(tr) => edit((d) => ({ ...d, trigger: tr }))} onCondition={(c) => edit((d) => ({ ...d, condition: c }))} />
      </CardColumn>
    </div>
  )
  return (
    <Dialog title={rule ? t('Edit routine') : t('New routine')} onClose={close} onEscape={close} size="xl" testId="routine-editor">
      <div className="space-y-3" onKeyDown={keys} data-routine-editor>
        <div className="mx-auto flex w-full max-w-[44rem] flex-wrap items-end gap-2">
          <Field label={t('Name')} className="min-w-0 flex-1">
            <Input value={draft.name} maxLength={200} placeholder={t('Groceries')} onChange={(e) => { const name = e.target.value; edit((d) => ({ ...d, name })) }} />
          </Field>
          <Button variant="secondary" onClick={test} busy={testing} disabled={!online || !!blocked || !draft.steps.length}
            >{t('Test')}</Button>
          {rule && <Button variant="ghost" icon="zap" disabled={!online} onClick={() => void runRoutineNow(rule, undefined)}>{t('Run now')}</Button>}
          <Button variant="primary" onClick={save}>{t('Save')}</Button>
        </div>
        {!online && <p className="mx-auto max-w-[44rem] text-meta text-muted">{t('Offline: Save works and syncs later; Test and Run now need a connection.')}</p>}
        {dropped && dropped.length > 0 && (
          <ul className="mx-auto max-w-[44rem] space-y-0.5 text-meta text-muted" data-rule-dropped>
            {dropped.map((d) => <li key={d}>{t('{term} cannot be used in a rule', { term: d })}</li>)}
          </ul>
        )}
        {saveError && <p role="alert" className="mx-auto max-w-[44rem] text-meta text-danger" data-save-error>{saveError}</p>}
        {draft.trigger.kind === 'schedule' && <EncryptedScheduleNote draft={draft} />}
        <p className="sr-only" aria-live="polite" data-announce>{announce}</p>
        {result && <div className="mx-auto max-w-[44rem]"><TestResult result={result} draft={draft} names={names} /></div>}
        {rule ? (
          <Tabs label={t('Routine')} value={tab} onChange={setTab} tabs={[{ id: 'steps', label: t('Steps') }, { id: 'history', label: t('History') }]}>
            {tab === 'steps' ? steps : (
              <div className="mx-auto max-w-[44rem]"><RunsList rules={[rule]} ruleId={rule.id} onOpen={(r) => setOpenRun(r.run_id)} /></div>
            )}
          </Tabs>
        ) : steps}
      </div>
      {adding && <AddStepSheet above={adding.above} catalogue={catalogue} onPick={pick} onClose={() => setAdding(null)} />}
      {openRun && <RunDetail rule={rule} runId={openRun} onClose={() => setOpenRun(null)} />}
      {discard && (
        <ConfirmDialog title={t('Discard your changes?')} consequence={t('The routine stays as it was saved.')} confirmLabel={t('Discard')}
          onConfirm={() => { setDiscard(false); onClose() }} onCancel={() => setDiscard(false)} />
      )}
    </Dialog>
  )
}

/** The server skips a scheduled routine with a text step on an encrypted account (routines-engine D9); the editor says so. */
function EncryptedScheduleNote({ draft }: { draft: RoutineDraft }) {
  const encrypted = useEncryption().enabled
  if (!encrypted) return null
  let step = ''
  try {
    step = contentStep(draft.steps, triggerOutput(draft.trigger.kind, !!draft.condition), draftTypes(draft))
  } catch {
    step = ''
  }
  if (!step) return null
  return <div className="mx-auto max-w-[44rem]"><Notice tone="warning">{t('Your account is encrypted: the server cannot read text, so a scheduled run skips this routine. Run now works on this device.')}</Notice></div>
}
