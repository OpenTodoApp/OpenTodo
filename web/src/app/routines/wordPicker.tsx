// One input's word and its picker (OpenSpec change routines-dynamic-data, design
// D13). Three kinds of picker, none of them a centred modal:
// - a choice (a flowing value, a project, a label, a view, a mode, a date): a
//   compact, searchable list anchored to the word (pickers.tsx ChoicePopover),
//   values that flow into the step first (the Repeat's item at the top), then
//   the fixed targets, "Find tasks…" and, for a one-task input, "A specific
//   task…" last;
// - a text: edited in place (InlineText);
// - condition rows and the changes of Change tasks: inside the card from 1024 px,
//   a bottom sheet below (Inspector).
import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../../lib/i18n'
import { insertStep, newId, placeOf, setInput, type RoutineDraft } from '../../lib/rules/draft'
import { fixFor } from '../../lib/rules/fixes'
import { inputLabel } from '../../lib/rules/sentence'
import { placeholders, textLiteral, triggerOutput, type StepInput } from '../../lib/rules/steps'
import type { RoutineArg, RoutineStep, RoutineStepType, Task } from '../../lib/types'
import { Button, Field, Input, WordButton } from '../../ui'
import { ChoicePopover, InlineText, Inspector, type Choice } from './pickers'
import { chipOptions, ComparePicker, DatePicker, ENUM_LABEL, LiteralPicker, PERIOD_LABEL, textValue, wordPlaceholder, wordValue, type ChipOption, type WordContext } from './words'

/** How an input is edited. */
type Mode = 'choice' | 'text' | 'inspector'

function modeOf(step: RoutineStep, def: StepInput, ctx: WordContext): Mode {
  if (def.literal === 'text') return 'text'
  if (def.literal === 'condition' || def.literal === 'actions') return 'inspector'
  if (def.literal === 'where') {
    const list = step.in?.list
    const type = list && 'ref' in list ? (list.ref === 'trigger' ? triggerOutput(ctx.draft.trigger.kind, !!ctx.draft.condition) : ctx.types[list.ref]) : undefined
    return type === 'lines' ? 'choice' : 'inspector'
  }
  return 'choice'
}

const typeName = (x: RoutineStepType): string => ({ text: 'Text', task: 'Task', tasks: 'Tasks', project: 'Project', date: 'Date', number: 'Number', lines: 'Lines', none: 'none' })[x]

function withRef(d: RoutineDraft, id: string, input: string, ref: string): RoutineDraft {
  return { ...d, steps: setInput(d.steps, id, input, { ref }) }
}

/** Inserts a step above `step` and points its input at it (Find tasks…, a project by name). */
function insertAbove(step: RoutineStep, def: StepInput, inserted: (id: string) => RoutineStep) {
  return (d: RoutineDraft): RoutineDraft => {
    const place = placeOf(d.steps, step.id)
    if (!place) return d
    const id = newId(d.steps)
    return { ...d, steps: setInput(insertStep(d.steps, place, inserted(id)), step.id, def.name, { ref: id }) }
  }
}

interface Actions {
  onSet: (a: RoutineArg | undefined) => void
  onEdit: (fn: (d: RoutineDraft) => RoutineDraft) => void
  specific: boolean
  setSpecific: (on: boolean) => void
}

/** The flowing values first (fitting ones, then those that need a conversion). */
function flowingChoices(step: RoutineStep, def: StepInput, ctx: WordContext, act: Actions): Choice[] {
  if (!def.accepts.length) return []
  const current = step.in?.[def.name]
  const ref = current && 'ref' in current ? current.ref : ''
  const fixOf = (o: ChipOption) => fixFor(withRef(ctx.draft, step.id, def.name, o.ref), { step: step.id, input: def.name, code: 'type_mismatch', message: `got ${typeName(o.type)}` })
  return chipOptions(step, def, ctx).map((o): Choice => {
    if (o.fit !== 'no') return { key: `ref:${o.ref}`, label: o.name, group: t('From earlier steps'), selected: o.ref === ref, run: () => act.onSet({ ref: o.ref }) }
    const fix = fixOf(o)
    return {
      key: `ref:${o.ref}`, label: o.name, group: t('Needs conversion'), secondary: fix?.label ?? t('No conversion'),
      run: () => { if (fix?.kind === 'edit') act.onEdit((x) => fix.apply(withRef(x, step.id, def.name, o.ref))); else act.onSet({ ref: o.ref }) },
    }
  })
}

/** The fixed targets of a literal: projects, labels, views, sections, webhooks, modes. */
function literalChoices(step: RoutineStep, def: StepInput, ctx: WordContext, act: Actions): Choice[] {
  const a = step.in?.[def.name]
  const v = a && 'literal' in a ? a.literal : undefined
  const n = ctx.names
  const pick = (literal: unknown) => () => act.onSet({ literal })
  switch (def.literal) {
    case 'project':
      return n.projects.filter((p) => !p.archived && !p.deleted_at).map((p) => ({ key: `p:${p.id}`, label: p.name, group: t('Projects'),
        selected: (v as { project?: string } | undefined)?.project === p.id, run: pick({ project: p.id }) }))
    case 'enum': return def.enum!.map((x) => ({ key: `e:${x}`, label: ENUM_LABEL[x] ?? x, selected: v === x, run: pick(x) }))
    case 'bool': return [true, false].map((x) => ({ key: `b:${x}`, label: x ? t('yes') : t('no'), selected: v === x, run: pick(x) }))
    case 'period': return Object.keys(PERIOD_LABEL).map((x) => ({ key: `pe:${x}`, label: PERIOD_LABEL[x], selected: v === x, run: pick(x) }))
    case 'ids': {
      const ids = Array.isArray(v) ? (v as string[]) : []
      return n.labels.filter((l) => !l.deleted_at).map((l) => ({ key: `l:${l.id}`, label: l.name, group: t('Labels'), selected: ids.includes(l.id), keep: true,
        run: () => { const next = ids.includes(l.id) ? ids.filter((x) => x !== l.id) : [...ids, l.id]; act.onSet(next.length ? { literal: next } : undefined) } }))
    }
    case 'id': {
      if (def.name === 'view') return n.views.map((x) => ({ key: `v:${x.id}`, label: x.name, group: t('Saved views'), selected: v === x.id, run: pick(x.id) }))
      if (def.name === 'webhook_id') return (n.webhooks ?? []).filter((w) => w.enabled !== false).map((w) => ({ key: `w:${w.id}`, label: w.url, group: t('Webhooks'), selected: v === w.id, run: pick(w.id) }))
      if (def.name === 'section') {
        const pa = step.in?.project
        const pid = pa && 'literal' in pa ? (pa.literal as { project?: string }).project : ''
        return n.sections.filter((s) => s.project_id === pid).map((s) => ({ key: `s:${s.id}`, label: s.name, group: t('Sections'), selected: v === s.id, run: pick(s.id) }))
      }
    }
  }
  // A project read by reference only (Ask AI's material): Find a project by its name above.
  if (!def.literal && def.accepts.includes('project')) {
    return n.projects.filter((p) => !p.archived && !p.deleted_at).map((p) => ({ key: `fp:${p.id}`, label: p.name, group: t('Projects'),
      run: () => act.onEdit(insertAbove(step, def, (id) => ({ id, kind: 'find_project', in: { name: { literal: p.name } } }))) }))
  }
  return []
}

/** Find tasks…, then a specific task (folded, last), then Remove. */
function moreChoices(step: RoutineStep, def: StepInput, act: Actions): Choice[] {
  const out: Choice[] = []
  if (def.accepts.includes('task') || def.accepts.includes('tasks')) {
    out.push({ key: 'find', label: t('Find tasks…'), group: t('More'), run: () => act.onEdit(insertAbove(step, def, (id) => ({ id, kind: 'find_tasks', in: { condition: { literal: {} } } }))) })
  }
  if (def.literal === 'task') out.push({ key: 'specific', label: t('A specific task…'), group: t('More'), keep: true, run: () => act.setSpecific(true) })
  if (step.in?.[def.name] && !def.required) out.push({ key: 'remove', label: t('Remove'), group: t('More'), run: () => act.onSet(undefined) })
  return out
}

/** A task chosen by hand, after "A specific task…" (routines-dynamic-data D4): the rare fixed target. */
function taskChoices(tasks: readonly Task[], act: Actions): Choice[] {
  return [
    { key: 'back', label: t('Back to the values'), keep: true, run: () => act.setSpecific(false) },
    ...tasks.filter((x) => !x.deleted_at && !x.completed_at).map((x) => ({ key: `t:${x.id}`, label: x.title, group: t('Always this task, whatever the routine finds'), run: () => act.onSet({ literal: { task: x.id } }) })),
  ]
}

/** Whether an input has a small field under its list. */
const hasFooter = (def: StepInput): boolean =>
  def.literal === 'number' || def.literal === 'lines' || def.literal === 'date' || def.literal === 'compare' || def.literal === 'where' || (def.literal === 'id' && def.name !== 'view' && def.name !== 'webhook_id' && def.name !== 'section')

/** A small field under the list for a number, a date, a test or a text to match. */
function Footer({ step, def, ctx, onSet }: { step: RoutineStep; def: StepInput; ctx: WordContext; onSet: (a: RoutineArg | undefined) => void }) {
  const a = step.in?.[def.name]
  const v = a && 'literal' in a ? a.literal : undefined
  switch (def.literal) {
    case 'number':
      return <Field label={inputLabel(def.name, step.kind)}><Input type="number" min={0} max={def.max} value={typeof v === 'number' ? v : ''}
        onChange={(e) => onSet(e.target.value === '' ? undefined : { literal: Math.max(0, Math.min(def.max ?? 1e9, Number(e.target.value))) })} /></Field>
    case 'lines': {
      // Lines typed one per line, when no list flows here (Create sections, Create labels).
      const text = Array.isArray(v) ? (v as string[]).join('\n') : ''
      return <Field label={t('One per line')}><textarea className="ui-input min-h-16 w-full" defaultValue={text}
        onChange={(e) => { const lines = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean); onSet(lines.length ? { literal: lines } : undefined) }} /></Field>
    }
    case 'date': return <DatePicker value={v} onSet={onSet} />
    case 'compare': return <ComparePicker value={v} onSet={onSet} />
    case 'where': return <LiteralPicker step={step} def={def} ctx={ctx} me="" onSet={onSet} />
    case 'id':
      if (def.name !== 'view' && def.name !== 'webhook_id' && def.name !== 'section') return <LiteralPicker step={step} def={def} ctx={ctx} me="" onSet={onSet} />
  }
  return null
}

/** One input's word and its picker. */
export function InputWord({ step, def, ctx, error, me, onSet, onEdit, openRef, onTyping }: {
  step: RoutineStep; def: StepInput; ctx: WordContext; error: boolean; me: string
  onSet: (a: RoutineArg | undefined) => void
  /** Applies a whole-draft edit (a conversion, a step inserted above). */
  onEdit: (fn: (d: RoutineDraft) => RoutineDraft) => void
  /** Lets the editor open this word's picker ("Choose a value"). */
  openRef?: (open: () => void) => void
  /** The text of this word is being typed (its error waits until it is kept). */
  onTyping?: (typing: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [specific, setSpecific] = useState(false)
  const [all, setAll] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  openRef?.(() => setOpen(true))
  const mode = modeOf(step, def, ctx)
  const typing = mode === 'text' && open
  useEffect(() => {
    if (!typing) return
    onTyping?.(true)
    return () => onTyping?.(false)
  }, [typing]) // eslint-disable-line react-hooks/exhaustive-deps -- onTyping is a fresh callback every render
  const { shown, chip } = wordValue(step, def, ctx)
  const text = textValue(step, def, ctx)
  const label = inputLabel(def.name, step.kind)
  const close = () => { setOpen(false); setSpecific(false); requestAnimationFrame(() => anchor.current?.focus()) }
  const act: Actions = { onSet, onEdit, specific, setSpecific }
  const choices = useMemo(() => (mode !== 'choice' ? [] : specific ? taskChoices(ctx.names.tasks, act)
    : [...flowingChoices(step, def, ctx, act), ...literalChoices(step, def, ctx, act), ...moreChoices(step, def, act)]),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- act holds this render's callbacks
  [mode, specific, step, def, ctx, onSet, onEdit])

  if (mode === 'text' && open) {
    const a = step.in?.[def.name]
    const insertable = chipOptions(step, def, ctx).filter((o) => o.type !== 'none').map((o) => ({ ref: o.ref, name: o.name }))
    // Values read as chips in the field («the count»), stored as placeholders ({b}).
    const toShown = (s: string) => s.replace(/\{([a-z0-9]{1,8})\}/g, (m, id: string) => { const o = insertable.find((x) => x.ref === id); return o ? `«${o.name}»` : m })
    const toStored = (s: string) => insertable.reduce((acc, o) => acc.split(`«${o.name}»`).join(`{${o.ref}}`), s)
    const start = toShown(!a ? '' : 'ref' in a ? `{${a.ref}}` : textLiteral(a.literal)?.text ?? '')
    const template = step.kind === 'format' && def.name === 'template'
    const commit = (shownText: string) => {
      setOpen(false)
      requestAnimationFrame(() => anchor.current?.focus())
      if (shownText === start) return
      const text = toStored(shownText)
      if (!text) return onSet(undefined)
      onSet({ literal: template || placeholders(text).length === 0 ? text : { format: text } })
    }
    return <InlineText label={label} value={start} max={def.max ?? 20000} insertable={insertable} onCommit={commit} />
  }
  return (
    <>
      <WordButton ref={anchor} label={label} value={text?.node ?? shown} valueText={text?.text} chip={chip} wrap={!!text} clamp={!!text?.long && !all}
        placeholder={wordPlaceholder(def)} error={error} action={t('change')}
        haspopup={mode === 'choice' ? 'listbox' : mode === 'inspector' ? 'dialog' : undefined} expanded={open} onClick={() => setOpen(true)} />
      {text?.long && (
        <Button size="sm" variant="ghost" aria-expanded={all} onClick={() => setAll((x) => !x)} data-word-more>{all ? t('Show less') : t('Show more')}</Button>
      )}
      {mode === 'choice' && (
        <ChoicePopover open={open} onClose={close} anchor={anchor} label={label} choices={choices} multiple={def.literal === 'ids'}
          placeholder={specific ? t('Find a task…') : undefined} footer={specific || !hasFooter(def) ? undefined : <Footer step={step} def={def} ctx={ctx} onSet={onSet} />} />
      )}
      {mode === 'inspector' && (
        <Inspector open={open} onClose={close} stepId={step.id} title={label}>
          <LiteralPicker step={step} def={def} ctx={ctx} me={me} onSet={onSet} />
        </Inspector>
      )}
    </>
  )
}
