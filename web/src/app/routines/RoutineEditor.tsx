// The routine editor (OpenSpec change routines-editor, design D1-D8, D13; a page
// since routines-editor-page): the When card and one sentence card per step in a
// centred reading column; + Add step, live previews, type errors with one-tap
// fixes, Save as operations (offline included), Test (a logged test run for a
// saved routine, the draft route otherwise) and, for a saved routine, Run now and
// its History. From 1024 px the test result, the History and a run's detail sit
// in a sticky column beside the steps; below it tabs switch between them. Save,
// Test and Run now are in the sticky header, on a phone in a bar at the bottom.
// Every edit is one undo step (Ctrl+Z). Loaded lazily with the Routines page.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { api } from '../../lib/api'
import { messageOf } from '../../lib/errorText'
import { t } from '../../lib/i18n'
import { uuid } from '../../lib/ids'
import { useOnline } from '../../lib/online'
import { useCatalogue, type Catalogue } from '../../lib/rules/catalogue'
import { sharedCatalogue } from '../../lib/rules/shared'
import {
  draftError, draftOf, draftTypes, duplicateStep, findStep, flowingTypeAt, insertNewStep, insertStep, moveStep, newId, NEW_ROUTINE, placeOf, removeStep, sameDraft, setInput, stepCount, stepNumber, storedOf,
  type RoutineDraft,
} from '../../lib/rules/draft'
import { errorText, fixFor, type Fix } from '../../lib/rules/fixes'
import { planDraft, serverPreview, type Preview } from '../../lib/rules/preview'
import { outputNames, stepName } from '../../lib/rules/sentence'
import { createRule, updateRule } from '../../lib/rules/store'
import { contentStep, hasAI, isAIKind, MAX_STEPS, triggerOutput } from '../../lib/rules/steps'
import { EncryptedRoutineNote } from './RoutinesDevice'
import { roundEstimate } from '../../lib/rules/ai'
import { useAssistantStatus } from '../../lib/assistantStatus'
import { useEncryption } from '../../lib/e2ee'
import { useMe } from '../../lib/timeEntries'
import type { RoutineStepType, Rule, RoutineTestResult } from '../../lib/types'
import { Badge, Button, ConfirmDialog, DESKTOP_HEADER_QUERY, Field, Icon, Input, Notice, PAGE_FRAME, PageHeader, Tabs, useMediaQuery } from '../../ui'
import { runRoutineNow } from '../palette/routineCommand'
import { setLeaveGuard } from '../router'
import { useShortcutScope } from '../shortcuts'
import { AddStepPanel } from './AddStep'
import { showBulkToast } from '../bulk/toastStore'
import { AISettings } from './AISettings'
import { usePreviewData, useRoutineNames, valueNamer } from './data'
import type { RuleDraft } from './ruleDraft'
import type { DescribedDraft } from './routineNav'
import { RunDetailBody, RunsList } from './RunHistory'
import { SharedRoutineLine, useSharedRoutine } from './SharedRoutine'
import { ADD_PANEL_ID, CardColumn, sentenceText, WhenCard, type CardEvents, type CardState } from './StepCard'
import { refName } from './words'

/** A rule draft (a board conversion) as a routine draft: one Change tasks card. */
export function routineDraftOf(d: RuleDraft): RoutineDraft {
  return draftOf({ name: d.name, trigger: d.trigger, condition: d.condition, actions: Object.keys(d.actions).length ? d.actions : { priority: 4 }, steps: null })
}

/** Where "+ Add step" inserts: below a card, or at the end of a list. */
type AddTarget = { parent: string; block: 'then' | 'otherwise' | 'do' | ''; index: number; above: RoutineStepType | 'start' }

type Edit = (fn: (d: RoutineDraft) => RoutineDraft) => void

/**
 * The step catalogue, expanded in place where "+ Add step" was pressed
 * (routines-editor-no-modals): its place, what gets focus when it collapses,
 * and the new step at that place. Pressing the same "+ Add step" again closes
 * it. Suggestions follow the data that flows to the place: the step above, a
 * Repeat's item, the trigger (routines-dynamic-data D3).
 */
function useStepCatalogue({ draft, types, catalogue, edit, focusAfter }: {
  draft: RoutineDraft; types: ReturnType<typeof draftTypes>; catalogue: Catalogue | null; edit: Edit; focusAfter: { current: string | null }
}) {
  const [adding, setAdding] = useState<AddTarget | null>(null)
  const opener = useRef('')
  const open = (target: Omit<AddTarget, 'above'>, from: string) => {
    const same = adding && adding.parent === target.parent && adding.block === target.block && adding.index === target.index
    opener.current = from
    setAdding(same ? null : { ...target, above: flowingTypeAt(draft, target, types) })
  }
  const close = (refocus = true) => {
    setAdding(null)
    const from = opener.current
    if (refocus) requestAnimationFrame(() => document.querySelector<HTMLElement>(from)?.focus())
  }
  const pick = (kind: string) => {
    if (!adding) return
    const target = adding
    setAdding(null)
    edit((d) => {
      if (stepCount(d.steps) >= MAX_STEPS) return d
      const id = newId(d.steps)
      focusAfter.current = id
      // The new step reads the data that flows to it, never a task chosen by hand (routines-dynamic-data D3).
      return insertNewStep(d, target, kind, id, types)
    })
  }
  return {
    adding,
    close,
    atEnd: () => open({ parent: '', block: '', index: -1 }, '[data-add-step]'),
    below: (id: string) => {
      const p = placeOf(draft.steps, id)
      if (p) open({ parent: p.parent, block: p.block, index: p.index + 1 }, `[data-step-card="${id}"]`)
    },
    inBlock: (parent: string, block: 'then' | 'otherwise' | 'do') => open({ parent, block, index: -1 }, `[data-add-in="${parent}.${block}"]`),
    panel: adding && <AddStepPanel key={`${adding.parent}.${adding.block}.${adding.index}`} id={ADD_PANEL_ID} above={adding.above} catalogue={catalogue} onPick={pick} onClose={() => close()} />,
  }
}

/** A step goes at once, with Undo in a toast (routines-editor-no-modals); focus moves to a neighbouring card. */
function removeWithUndo(draft: RoutineDraft, id: string, edit: Edit, focusAfter: { current: string | null }, announce: (text: string) => void) {
  const s = findStep(draft.steps, id)
  const place = placeOf(draft.steps, id)
  if (!s || !place) return
  const card = document.querySelector<HTMLElement>(`[data-step-card="${id}"]`)
  const near = [card?.nextElementSibling, card?.previousElementSibling].find((x) => x?.hasAttribute('data-step-card'))
  focusAfter.current = near?.getAttribute('data-step-card') ?? null
  if (!focusAfter.current) requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-add-step]')?.focus())
  edit((d) => ({ ...d, steps: removeStep(d.steps, id) }))
  const text = t('Step deleted: {step}', { step: stepName(s.kind) })
  announce(text)
  showBulkToast(text, null, { action: { label: t('Undo'), run: () => {
    focusAfter.current = id
    // Back where it was, unless it is already back or its block is gone.
    edit((d) => (findStep(d.steps, id) || (place.parent && !findStep(d.steps, place.parent)) ? d : { ...d, steps: insertStep(d.steps, place, s) }))
  } } })
}

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
  const types = draftTypes(draft)
  const outputs = outputNames(draft.steps, valueNamer(names), types)
  const ctx = { draft, types, outputs, names }
  const ok = result.run.outcome !== 'failed'
  const tokens = result.steps.reduce((n, r) => n + (r.tokens ?? 0), 0)
  const answers = result.steps.filter((r) => isAIKind(r.kind) && r.status === 'ok')
  return (
    <section className="surface-card space-y-2 p-3" aria-label={t('Test')} data-test-result={result.run.outcome}>
      <p className={`text-body ${ok ? 'text-default' : 'text-danger'}`}>
        {ok ? t('{n, plural, one {Test finished: would write # item, nothing was written} other {Test finished: would write # items, nothing was written}}', { n: result.writes })
          : t('Test failed at step {n}, nothing was written', { n: result.run.failed_step + 1 })}
      </p>
      {tokens > 0 && <p className="text-meta text-muted" data-test-tokens>{t('{n, plural, one {The AI steps used # token} other {The AI steps used # tokens}}', { n: tokens })}</p>}
      {answers.map((r) => (
        <div key={r.step_id} className="space-y-1" data-test-ai={r.step_id}>
          <Badge hue="blue">{t('Written by AI')}</Badge>
          <p className="user-text whitespace-pre-wrap text-meta text-default">{Array.isArray(r.preview) ? (r.preview as string[]).join('\n') : String(r.preview ?? '')}</p>
        </div>
      ))}
      <ol className="space-y-1 text-meta text-muted">
        {result.steps.map((r) => {
          const s = findStep(draft.steps, r.step_id)
          return <li key={r.step_id} data-test-step={r.status}>{s ? sentenceText(s, ctx) : r.kind} · {r.status === 'ok' ? t('Done') : r.status}{r.error ? ` · ${r.error}` : ''}</li>
        })}
      </ol>
    </section>
  )
}

export interface RoutineEditorProps {
  /** The saved routine; undefined for a new one (and for a moment after its first save). */
  rule?: Rule
  /** A new routine's starting draft (a view's or a board column's rule). */
  draft?: RoutineDraft
  /** A new routine's project (New routine's Where, routines-shared D12). */
  project?: string
  /** Terms of a converted filter that a rule cannot use. */
  dropped?: string[]
  /** The draft came from Describe it (routines-describe-it D3): the banner, its errors shown at once, unsaved. */
  described?: DescribedDraft
  /** A run to show in the History column (/routines/<id>?run=<run>). */
  run?: string
  /** Open with the History shown (the row menu's History). */
  history?: boolean
  /** Leave the page (Back, the breadcrumb, Escape); the router asks first while there are unsaved changes. */
  onBack: () => void
  /** A save went through: the routine's id, and whether it was created. */
  onSaved?: (id: string, created: boolean) => void
}

type Pane = 'steps' | 'test' | 'history'

/** The page's two wide-screen breakpoints: the header's own row (768 px) and the side column (1024 px). */
const WIDE_QUERY = '(min-width: 64rem)'

/** Test (D8): a logged test run for a saved, unchanged routine, the draft route otherwise; AI steps ask first (routines-ai-step D11). */
function useRoutineTest({ draft, rule, dirty, online, blocked, withAI, estimate, taskId, projectId, onStart, onAnnounce, onError }: {
  draft: RoutineDraft; rule: Rule | undefined; dirty: boolean; online: boolean; blocked: boolean; withAI: boolean; estimate: number; taskId: string | undefined
  /** A shared routine's project: the draft is planned inside it (routines-shared D3). */
  projectId?: string
  onStart: () => void; onAnnounce: (text: string) => void; onError: (e: unknown) => void
}) {
  const [testing, setTesting] = useState(false)
  const [confirmAI, setConfirmAI] = useState(false)
  const [result, setResult] = useState<RoutineTestResult | null>(null)
  const assistant = useAssistantStatus()
  const runTest = (callAI: boolean) => {
    setTesting(true)
    setResult(null)
    onStart()
    const ai = callAI ? { call_ai: true } : {}
    const req = rule && !dirty
      ? api.testRoutine(rule.id, { run_id: uuid(), ...(taskId ? { task_id: taskId } : {}), ...ai })
      : api.testRoutineDraft({ trigger: draft.trigger, condition: draft.condition, steps: draft.steps, ...(taskId ? { task_id: taskId } : {}), ...(projectId ? { project_id: projectId } : {}), ...ai })
    req.then((r) => {
      setResult(r)
      onAnnounce(r.run.outcome === 'failed' ? t('Test failed at step {n}, nothing was written', { n: r.run.failed_step + 1 }) : t('{n, plural, one {Test finished: would write # item, nothing was written} other {Test finished: would write # items, nothing was written}}', { n: r.writes }))
    }, onError).finally(() => setTesting(false))
  }
  const test = () => {
    if (!online || blocked || !draft.steps.length) return
    // AI steps ask first, inside the Test panel, never in a dialog (routines-editor-no-modals).
    if (withAI) { onStart(); setConfirmAI(true) } else runTest(false)
  }
  const ask: AskAI | null = confirmAI ? {
    consequence: t('This test sends the inputs to {provider} and uses about {n} tokens. Nothing is written.', { provider: assistant?.provider_label || t('your assistant’s provider'), n: roundEstimate(estimate) }),
    confirm: () => { setConfirmAI(false); runTest(true) },
    cancel: () => { setConfirmAI(false); requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-routine-test]')?.focus()) },
  } : null
  return { test, testing, result, ask }
}

/** The question before a test that calls the AI: what it sends and costs, Test or Cancel. */
interface AskAI { consequence: string; confirm: () => void; cancel: () => void }

/** Leaving with unsaved changes asks first (D4), and Escape leaves the page (D5). */
function usePageGuards(dirty: boolean, onBack: () => void): [(() => void) | null, (go: (() => void) | null) => void] {
  const [leave, setLeave] = useState<(() => void) | null>(null)
  // Unsaved changes: every way off the page asks first (D4); closing the tab gets the browser's prompt.
  useEffect(() => {
    if (!dirty) return
    setLeaveGuard((go) => { setLeave(() => go); return true })
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', unload)
    return () => {
      setLeaveGuard(null)
      window.removeEventListener('beforeunload', unload)
    }
  }, [dirty])
  // Escape leaves the page (the registry's routines.escape), unless an overlay above it keeps its own Escape (D5).
  useShortcutScope('view', {
    'routines.escape': (e) => {
      if ((e.target as HTMLElement | null)?.closest?.('[data-overlay], [data-overlay-root]')) return false
      // A text being typed in a card is never left behind by Escape (routines-editor-polish):
      // focus goes back to it, and Escape there keeps it.
      const typing = document.querySelector<HTMLTextAreaElement>('[data-inline-text] textarea')
      if (typing) { typing.focus(); return }
      onBack()
    },
  }, { view: 'rules' })
  return [leave, setLeave]
}

export function RoutineEditor({ rule, draft: initial, project, dropped, described, run, history, onBack, onSaved }: RoutineEditorProps) {
  const start = useMemo(() => (rule ? draftOf(rule) : initial ?? NEW_ROUTINE), [rule, initial])
  const { draft, edit: editDraft, undo, canUndo } = useDraft(start)
  const me = useMe() ?? ''
  const online = useOnline()
  const names = useRoutineNames()
  const shared = useSharedRoutine(rule?.id, rule ? rule.project_id : project)
  const ownCatalogue = useCatalogue()
  // A shared routine cannot use personal steps (routines-shared D3).
  const catalogue = useMemo(() => (shared ? sharedCatalogue(ownCatalogue) : ownCatalogue), [shared?.projectId, ownCatalogue]) // eslint-disable-line react-hooks/exhaustive-deps
  const readOnly = !!shared && !shared.canEdit
  const desktop = useMediaQuery(DESKTOP_HEADER_QUERY)
  const wide = useMediaQuery(WIDE_QUERY)
  const [pane, setPane] = useState<Pane>(run || history ? 'history' : 'steps')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [announce, setAnnounce] = useState('')
  const [openRun, setOpenRun] = useState<string | null>(run ?? null)
  // The last saved state: Save stays on the page (routines-editor-page D3), so unsaved means "since then".
  // A drafted routine is unsaved from the start: leaving asks first (routines-describe-it D3).
  const [baseline, setBaseline] = useState(described ? NEW_ROUTINE : start)
  const [savedId, setSavedId] = useState(rule?.id)
  const focusAfter = useRef<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const openers = useRef(new Map<string, () => void>()).current

  // An edit clears a message about the last save attempt ("A routine needs at least one step").
  const edit = useCallback((fn: (d: RoutineDraft) => RoutineDraft) => {
    setSaveError('')
    setJustSaved(false)
    editDraft(fn)
  }, [editDraft])

  const types = useMemo(() => draftTypes(draft), [draft])
  const outputs = useMemo(() => outputNames(draft.steps, valueNamer(names), types), [draft.steps, names, types])
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
  // Fixes wire the data that flows into the step (routines-dynamic-data D3).
  const flow = { types, name: (ref: string) => refName(ref, ctx, error?.step ?? '') }
  // An empty input of a step being filled in is not an error yet: "needs a value here" shows once
  // focus has left its card, or Save was pressed (routines-editor-polish); type errors show at once.
  const [left, setLeft] = useState<ReadonlySet<string>>(() => new Set())
  // A drafted routine shows every error at once, on its card (routines-describe-it D3).
  const [tried, setTried] = useState(!!described)
  const leaveCard = useCallback((id: string) => setLeft((s) => (s.has(id) ? s : new Set(s).add(id))), [])
  const waiting = !!error && error.code === 'missing_input' && !tried && !left.has(error.step)
  const shownError = error && !waiting ? { step: error.step, input: error.input, text: errorText(draft, error, outputs), fix: fixFor(draft, error, flow) } : null
  const dirty = !sameDraft(baseline, draft)
  const saved = !!savedId
  const [leave, setLeave] = usePageGuards(dirty, onBack)

  // Focus moves to the page heading when the page opens (D5).
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])
  // The header's height, so the side column pins just under it.
  const root = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const head = root.current?.querySelector<HTMLElement>('[data-page-header]')
    root.current?.style.setProperty('--routine-header-h', `${head?.offsetHeight ?? 0}px`)
  })

  // Focus stays on a moved card (D13).
  useEffect(() => {
    const id = focusAfter.current
    if (!id) return
    focusAfter.current = null
    document.querySelector<HTMLElement>(`[data-step-card="${id}"]`)?.focus()
  }, [draft])


  // A run opened from a link while the page is open (the Inbox card, a notification).
  useEffect(() => {
    if (!run) return
    setOpenRun(run)
    setPane('history')
  }, [run])

  const add = useStepCatalogue({ draft, types, catalogue, edit, focusAfter })
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
    remove: (id) => {
      add.close(false)
      removeWithUndo(draft, id, edit, focusAfter, setAnnounce)
    },
    addBelow: add.below,
    addIn: add.inBlock,
    fix: (f: Fix) => {
      if (f.kind === 'edit') edit(f.apply)
      else openers.get(`${f.step}.${f.input}`)?.()
    },
  }
  const blocked = error && error.code !== 'unavailable' ? error : null
  const save = () => {
    setSaveError('')
    setTried(true)
    const name = draft.name.trim()
    if (!name) { setSaveError(t('A routine needs a name')); return }
    if (!draft.steps.length) { setSaveError(t('A routine needs at least one step')); return }
    if (blocked) { setSaveError(t('Fix step {n} first', { n: stepNumber(draft.steps, blocked.step) || 1 })); return }
    if (saved && !dirty) return
    if (readOnly) return
    const stored = storedOf(draft)
    const snapshot = draft
    setSaving(true)
    const done = savedId
      ? updateRule(savedId, { name, trigger: draft.trigger, condition: draft.condition, ...stored, ...(hasAI(draft.steps) || rule?.ai_budget ? { ai_budget: draft.aiBudget ?? 0 } : {}) }).then(() => savedId)
      : createRule({ name, trigger: draft.trigger, condition: draft.condition, ...stored, ai_apply: draft.aiApply, ai_budget: draft.aiBudget, project_id: shared?.projectId ?? null })
    Promise.resolve(done).then((id) => {
      const created = !savedId
      setBaseline(snapshot)
      setSavedId(id)
      setJustSaved(true)
      setAnnounce(t('Saved'))
      // The guard goes before the address moves to the new id (D3).
      setLeaveGuard(null)
      onSaved?.(id, created)
    }, (e: unknown) => setSaveError(messageOf(e))).finally(() => setSaving(false))
  }
  const withAI = hasAI(draft.steps)
  const estimate = [...previews.values()].reduce((n, p) => n + (p.state === 'ai' ? p.estimate : 0), 0)
  const { test, testing, result, ask } = useRoutineTest({
    draft, rule, dirty, online, blocked: !!blocked, withAI, estimate, taskId: triggerType === 'task' ? data.triggerTask?.id : undefined, projectId: shared?.projectId,
    onStart: () => setPane('test'), onAnnounce: setAnnounce, onError: (e) => setSaveError(messageOf(e)),
  })
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key === 'Enter' && e.shiftKey) { e.preventDefault(); test() }
    else if (mod && (e.key === 'Enter' || (e.key.toLowerCase() === 's' && !e.shiftKey && !e.altKey))) { e.preventDefault(); save() }
    else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey && canUndo && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); undo() }
  }

  const state: CardState = { ctx, catalogue, previews, online, error: shownError, me, openers, leave: leaveCard, adding: add.adding, addPanel: add.panel }
  const name = draft.name.trim() || (saved ? t('Untitled routine') : t('New routine'))

  const actions = (
    <>
      <Button variant="secondary" size="sm" icon="list-checks" onClick={test} busy={testing} disabled={!online || !!blocked || !draft.steps.length}
        data-routine-test>{t('Test')}</Button>
      {saved && !readOnly && <Button variant="ghost" size="sm" icon="zap" disabled={!online || !rule} onClick={() => { if (rule) void runRoutineNow(rule, undefined) }} data-routine-run>{t('Run now')}</Button>}
      <Button variant="primary" size="sm" onClick={save} busy={saving} disabled={readOnly} data-routine-save>{t('Save')}</Button>
    </>
  )

  const notices = <>{shared && <SharedRoutineLine shared={shared} me={me} baseline={baseline} draft={draft} saved={saved} />}
    <EditorNotices online={online} dropped={dropped} saveError={saveError} draft={draft} described={saved ? undefined : described} shared={!!shared} /></>
  const stepsColumn = (
    <section className="space-y-2" aria-label={t('Steps of {name}', { name })} data-routine-steps>
      {draft.steps.length === 0 && <p className="text-meta text-muted">{t('Add the first step: what should happen?')}</p>}
      <CardColumn steps={draft.steps} state={state} events={events} onAdd={add.atEnd}>
        <WhenCard trigger={draft.trigger} condition={draft.condition} ctx={ctx} me={me}
          onTrigger={(tr) => edit((d) => ({ ...d, trigger: tr }))} onCondition={(c) => edit((d) => ({ ...d, condition: c }))} />
      </CardColumn>
      {withAI && <AISettings rule={rule} draft={draft} online={online} onDraft={edit} />}
    </section>
  )

  const status = <SaveStatus dirty={dirty} justSaved={justSaved} />
  const crumbs = <Crumbs name={name} onBack={onBack} />
  const testPanel = <TestPanel result={result} draft={draft} names={names} online={online} testing={testing} disabled={!!blocked || !draft.steps.length} onTest={test} ask={ask} />
  const historyPanel = <HistoryPanel rule={rule} openRun={openRun} onOpen={setOpenRun} />
  const sideTabs = [{ id: 'test', label: t('Test') }, ...(saved ? [{ id: 'history', label: t('History') }] : [])]
  const sidePane: Pane = pane === 'history' && saved ? 'history' : 'test'
  let body: ReactNode
  if (wide) {
    body = (
      <div className="mx-auto grid w-full max-w-[69rem] grid-cols-[minmax(0,44rem)_22rem] justify-center gap-12 pb-[min(40vh,20rem)] pt-4">
        <div className="min-w-0 space-y-4">
          <NameField draft={draft} edit={edit} />
          {notices}
          {stepsColumn}
        </div>
        <aside aria-label={t('Test and history')} className="sticky top-(--routine-header-h) max-h-[calc(100dvh-var(--routine-header-h)-2rem)] min-w-0 self-start overflow-y-auto border-l border-soft pl-8" data-routine-side data-scroll-y>
          <Tabs label={t('Test and history')} value={sidePane} onChange={(id) => setPane(id as Pane)} tabs={sideTabs}>
            <div className="pt-3">{sidePane === 'history' ? historyPanel : testPanel}</div>
          </Tabs>
        </aside>
      </div>
    )
  } else {
    const tabs = [{ id: 'steps', label: t('Steps') }, ...sideTabs]
    body = (
      <div className="mx-auto w-full max-w-[44rem] space-y-4 pb-6 pt-3">
        <NameField draft={draft} edit={edit} />
        {notices}
        <Tabs label={t('Routine')} value={pane === 'history' && !saved ? 'test' : pane} onChange={(id) => setPane(id as Pane)} tabs={tabs}>
          <div className="pt-3">{pane === 'steps' ? stepsColumn : pane === 'history' && saved ? historyPanel : testPanel}</div>
        </Tabs>
      </div>
    )
  }

  return (
    <div ref={root} className={`${PAGE_FRAME} px-4 md:px-8`} onKeyDown={keys} data-routine-editor data-testid="routine-editor" data-routine-page={savedId ?? 'new'}>
      <PageHeader title={desktop ? crumbs : name} titleRef={heading} titleTabIndex={-1} help="routines"
        back={desktop ? undefined : { label: t('Routines'), href: '/routines', onClick: onBack }}
        actions={desktop ? <>{status}{actions}</> : undefined} />
      <p className="sr-only" aria-live="polite" data-announce>{announce}</p>
      {body}
      {!desktop && (
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-soft bg-canvas px-4 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]" data-routine-actions>
          <div className="mr-auto">{status}</div>
          {actions}
        </div>
      )}
      {leave && (
        <ConfirmDialog title={t('Discard your changes?')} consequence={t('The routine stays as it was saved.')} confirmLabel={t('Discard')}
          onConfirm={() => { const go = leave; setLeave(null); go() }} onCancel={() => setLeave(null)} />
      )}
    </div>
  )
}

function EditorNotices({ online, dropped, saveError, draft, described, shared }: { online: boolean; dropped?: string[]; saveError: string; draft: RoutineDraft; described?: DescribedDraft; shared: boolean }) {
  return (
    <>
      {described && (
        <div data-ai-drafted>
          <Notice tone="info">
            <span className="block font-medium">{t('Drafted by AI: check each step, then Save')}</span>
            {described.note && <span className="user-text block" data-ai-note>{described.note}</span>}
          </Notice>
        </div>
      )}
      {!online && <p className="text-meta text-muted">{t('Offline: Save works and syncs later; Test and Run now need a connection.')}</p>}
      {dropped && dropped.length > 0 && (
        <ul className="space-y-0.5 text-meta text-muted" data-rule-dropped>
          {dropped.map((d) => <li key={d}>{t('{term} cannot be used in a rule', { term: d })}</li>)}
        </ul>
      )}
      {saveError && <p role="alert" className="text-meta text-danger" data-save-error>{saveError}</p>}
      {/* A shared routine is plaintext and runs on the server (routines-shared D10). */}
      {draft.trigger.kind !== 'manual' && !shared && <EncryptedScheduleNote draft={draft} />}
    </>
  )
}

function SaveStatus({ dirty, justSaved }: { dirty: boolean; justSaved: boolean }) {
  return (
    <span className="inline-flex min-h-9 items-center gap-1.5 px-1 text-meta text-muted" role="status" data-unsaved={dirty || undefined}>
      {dirty && <><span className="h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />{t('Unsaved changes')}</>}
      {!dirty && justSaved && <><Icon name="check" size="xs" className="text-success" />{t('Saved')}</>}
    </span>
  )
}

function Crumbs({ name, onBack }: { name: string; onBack: () => void }) {
  const crumbClass = 'rounded-control px-1 text-muted hover:bg-hover hover:text-default'
  return (
    <span className="flex min-w-0 items-center gap-0.5 text-body font-normal" data-breadcrumb>
      <button type="button" className={`shrink-0 ${crumbClass}`} onClick={onBack} data-crumb="routines">{t('Routines')}</button>
      <Icon name="chevron-right" size="xs" className="shrink-0 text-faint" />
      <span className="user-text min-w-0 truncate px-1 text-strong" aria-current="page" data-crumb="routine">{name}</span>
    </span>
  )
}

function TestPanel({ result, draft, names, online, testing, disabled, onTest, ask }: {
  result: RoutineTestResult | null; draft: RoutineDraft; names: ReturnType<typeof useRoutineNames>; online: boolean; testing: boolean; disabled: boolean; onTest: () => void
  ask: AskAI | null
}) {
  if (ask) {
    return (
      <section className="surface-card space-y-3 p-3" aria-label={t('Test with AI?')} data-routine-test-panel data-test-ask-ai data-overlay="inline"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ask.cancel() } }}>
        <p className="text-body font-medium text-default">{t('Test with AI?')}</p>
        <p className="text-meta text-muted">{ask.consequence}</p>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={ask.cancel}>{t('Cancel')}</Button>
          <Button size="sm" variant="primary" icon="list-checks" onClick={ask.confirm} autoFocus data-test-ai-confirm>{t('Test')}</Button>
        </div>
      </section>
    )
  }
  return (
    <div className="space-y-3" data-routine-test-panel>
      {result ?<TestResult result={result} draft={draft} names={names} /> : (
        <div className="space-y-3 rounded-card border border-dashed border-default p-4">
          <p className="text-body text-muted">{t('Test runs every step against your tasks and shows what each would do. Nothing is written.')}</p>
          {!online && <p className="text-meta text-muted">{t('Needs a connection')}</p>}
          <Button variant="secondary" size="sm" icon="list-checks" onClick={onTest} busy={testing} disabled={!online || disabled}>{t('Run a test')}</Button>
        </div>
      )}
    </div>
  )
}

function HistoryPanel({ rule, openRun, onOpen }: { rule: Rule | undefined; openRun: string | null; onOpen: (run: string | null) => void }) {
  if (!rule) return <p className="text-meta text-muted">{t('Save the routine to see its runs.')}</p>
  if (!openRun) return <RunsList rules={[rule]} ruleId={rule.id} onOpen={(r) => onOpen(r.run_id)} />
  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" icon="arrow-left" className="-ml-2" onClick={() => onOpen(null)} data-runs-back>{t('All runs')}</Button>
      <RunDetailBody key={openRun} rule={rule} runId={openRun} />
    </div>
  )
}

function NameField({ draft, edit }: { draft: RoutineDraft; edit: (fn: (d: RoutineDraft) => RoutineDraft) => void }) {
  return (
    <Field label={t('Name')}>
      <Input value={draft.name} maxLength={200} placeholder={t('Groceries')} className="text-h3 placeholder:font-normal" data-routine-name
        onChange={(e) => { const name = e.target.value; edit((d) => ({ ...d, name })) }} />
    </Field>
  )
}

/**
 * On an encrypted account a routine with a text or AI step and a schedule or
 * event trigger runs on one of the user's devices (routines-ai-step D7, D12):
 * the editor says so, with the opt-in.
 */
function EncryptedScheduleNote({ draft }: { draft: RoutineDraft }) {
  const encrypted = useEncryption().enabled
  if (!encrypted) return null
  let step = ''
  try {
    step = contentStep(draft.steps, triggerOutput(draft.trigger.kind, !!draft.condition), draftTypes(draft))
  } catch {
    step = ''
  }
  if (!step && !hasAI(draft.steps)) return null
  return <EncryptedRoutineNote />
}
