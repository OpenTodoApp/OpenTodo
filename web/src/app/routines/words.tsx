// The word buttons of a step card and their pickers (OpenSpec change
// routines-editor, design D3): what an input reads ("Errands", "the lines",
// "choose a project"), and the picker each input kind opens: chips of earlier
// outputs (nearest first, "Needs conversion" below a divider), the Combobox for
// projects, labels, views, tasks and webhooks, fields for text, numbers and
// dates, the rule condition and action controls.
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useEncryption } from '../../lib/e2ee'
import { formatList, msg, t, translatedMap } from '../../lib/i18n'
import { useMemberships } from '../../lib/localData'
import { enclosingRepeat, fitOf, flowingTo, insertStep, newId, placeOf, setInput, type RoutineDraft } from '../../lib/rules/draft'
import { fixFor } from '../../lib/rules/fixes'
import { inputLabel, itemName, triggerOutputName, typeLabel } from '../../lib/rules/sentence'
import { actionParts, conditionParts } from '../../lib/rules/summary'
import { dateLiteral, placeholders, stepKind, textLiteral, triggerOutput, type StepInput } from '../../lib/rules/steps'
import type { RoutineArg, RoutineStep, RoutineStepType, RuleActions, RuleCondition, Task } from '../../lib/types'
import { Button, Combobox, DataChip, Field, Input, Popover, Switch, WordButton } from '../../ui'
import { ActionFields, ConditionFields } from '../rules/RuleFields'
import type { RoutineNames } from './data'

export const ENUM_LABEL = translatedMap<string>({
  deep: msg('Deep'), medium: msg('Medium'), low: msg('Low'), due: msg('date'), deadline: msg('deadline'), priority: msg('priority'), created: msg('creation'),
  title: msg('title'), text: msg('text'), asc: msg('ascending'), desc: msg('descending'), start: msg('the start'), end: msg('the end'),
  lines: msg('lines'), short: msg('short'),
})
const PERIOD_LABEL = translatedMap<string>({ today: msg('today'), this_week: msg('this week'), last_week: msg('last week'), this_month: msg('this month') })
const COMPARE_LABEL = translatedMap<string>({
  '>': msg('is more than'), '>=': msg('is at least'), '=': msg('is'), '!=': msg('is not'), '<=': msg('is at most'), '<': msg('is less than'),
  empty: msg('is empty'), not_empty: msg('is not empty'), contains: msg('contains'),
})

/** What the editor knows about the draft when it renders a word. */
export interface WordContext {
  draft: RoutineDraft
  types: Record<string, RoutineStepType>
  outputs: Map<string, string>
  names: RoutineNames
}

/** The name of a reference ("the lines", "the trigger's task", "each task"). */
export function refName(ref: string, ctx: WordContext, at: string): string {
  if (ref === 'trigger' && ctx.draft.trigger.kind === 'manual') return t('the task you run it on')
  if (ref === 'trigger') return triggerOutputName(triggerOutput(ctx.draft.trigger.kind, !!ctx.draft.condition))
  if (ref === 'item') {
    const rep = enclosingRepeat(ctx.draft.steps, at)
    const list = rep ? ctx.draft.steps.length && findList(ctx, rep) : ''
    return itemName(list === 'tasks' ? 'task' : list === 'lines' ? 'text' : '')
  }
  return ctx.outputs.get(ref) ?? t('a removed step')
}

function findList(ctx: WordContext, repeatId: string): RoutineStepType | '' {
  const find = (list: readonly RoutineStep[]): RoutineStep | undefined => {
    for (const s of list) {
      if (s.id === repeatId) return s
      const x = find(s.then ?? []) ?? find(s.otherwise ?? []) ?? find(s.do ?? [])
      if (x) return x
    }
  }
  const rep = find(ctx.draft.steps)
  const a = rep?.in?.list
  if (!a || !('ref' in a)) return ''
  return a.ref === 'trigger' ? triggerOutput(ctx.draft.trigger.kind, !!ctx.draft.condition) : ctx.types[a.ref] ?? ''
}

/** A text literal with its {id} placeholders shown as «names». */
function templateShown(text: string, ctx: WordContext, at: string): string {
  return text.replace(/\{([a-z0-9]{1,8})\}/g, (m, id: string) => (id === 'trigger' || id === 'item' || ctx.outputs.has(id) ? `«${refName(id, ctx, at)}»` : m))
}

const clip = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** An input's value as a word shows it ('' when unset) and whether it is a chip. */
export function wordValue(step: RoutineStep, def: StepInput, ctx: WordContext): { shown: string; chip: boolean } {
  const a = step.in?.[def.name]
  if (!a) return { shown: '', chip: false }
  if ('ref' in a) return { shown: refName(a.ref, ctx, step.id), chip: true }
  const v = a.literal
  const n = ctx.names
  switch (def.literal) {
    case 'text': {
      const tl = textLiteral(v)
      return { shown: tl ? clip(templateShown(tl.text, ctx, step.id)) : '', chip: false }
    }
    case 'number': return { shown: typeof v === 'number' ? String(v) : '', chip: false }
    case 'date': {
      const d = dateLiteral(v)
      if (!d) return { shown: '', chip: false }
      return { shown: d.word === 'today' ? t('today') : d.word === 'tomorrow' ? t('tomorrow') : d.word === 'in_days' ? t('{n, plural, one {in # day} other {in # days}}', { n: d.inDays ?? 0 }) : d.date ?? '', chip: false }
    }
    case 'project': return { shown: n.projectName((v as { project: string }).project) || t('a removed project'), chip: false }
    case 'task': return { shown: n.title((v as { task: string }).task) || t('a deleted task'), chip: false }
    case 'lines': return { shown: Array.isArray(v) ? clip(formatList(v as string[])) : '', chip: false }
    case 'bool': return { shown: v === true ? t('yes') : t('no'), chip: false }
    case 'enum': return { shown: ENUM_LABEL[String(v)] ?? String(v), chip: false }
    case 'ids': return { shown: Array.isArray(v) ? formatList((v as string[]).map((id) => n.labels.find((l) => l.id === id)?.name ?? t('a removed label'))) : '', chip: false }
    case 'id': {
      const id = String(v)
      if (def.name === 'view') return { shown: n.views.find((x) => x.id === id)?.name ?? t('a removed view'), chip: false }
      if (def.name === 'webhook_id') return { shown: n.webhooks?.find((w) => w.id === id)?.url ?? t('a webhook'), chip: false }
      if (def.name === 'section') return { shown: n.sections.find((x) => x.id === id)?.name ?? t('a removed section'), chip: false }
      return { shown: id, chip: false }
    }
    case 'actions': return { shown: clip(actionParts(v as RuleActions, n).join(', ')), chip: false }
    case 'condition': {
      const parts = conditionParts(v as RuleCondition, n)
      return { shown: parts.length ? clip(parts.join(', ')) : t('any open task'), chip: false }
    }
    case 'where': {
      const w = v as Record<string, unknown>
      if ('contains' in w) return { shown: t('contains “{text}”', { text: String(w.contains) }), chip: false }
      if ('not_contains' in w) return { shown: t('does not contain “{text}”', { text: String(w.not_contains) }), chip: false }
      return { shown: clip(conditionParts(w as RuleCondition, n).join(', ') || t('anything')), chip: false }
    }
    case 'compare': {
      const [op, x] = Object.entries((v ?? {}) as Record<string, unknown>)[0] ?? ['', '']
      return { shown: `${COMPARE_LABEL[op] ?? op}${op === 'empty' || op === 'not_empty' ? '' : ` ${String(x)}`}`, chip: false }
    }
    case 'period': return { shown: typeof v === 'string' ? PERIOD_LABEL[v] ?? v : t('{from} to {to}', v as { from: string; to: string }), chip: false }
  }
  return { shown: '', chip: false }
}

/** The accent placeholder of an empty word. */
export function wordPlaceholder(def: StepInput): string {
  switch (def.literal) {
    case 'project': return t('choose a project')
    // Task inputs take a list: name what is wanted, not one pick (routines-dynamic-data D3).
    case 'task': return t('choose which tasks')
    case 'text': return t('write a text')
    case 'number': return t('choose a number')
    case 'date': return t('choose a date')
    case 'ids': return t('choose labels')
    case 'condition':
    case 'where': return t('choose what matches')
    case 'actions': return t('choose the changes')
    case 'compare': return t('choose a test')
    case 'period': return t('choose a period')
  }
  if (def.accepts.includes('task') || def.accepts.includes('tasks')) return t('choose which tasks')
  if (def.accepts.length) return t('choose a value')
  return t('choose')
}

interface ChipOption { ref: string; name: string; type: RoutineStepType; fit: 'yes' | 'each' | 'no' }

/**
 * The references an input of a step can read, in the order of routines-dynamic-data D3:
 * a Repeat's item, earlier outputs nearest first, then the trigger (a manual
 * routine's "task you run it on" included). A list fits a one-task input.
 */
export function chipOptions(step: RoutineStep, def: StepInput, ctx: WordContext): ChipOption[] {
  return flowingTo(ctx.draft, step.id, ctx.types, true).map((f) => ({
    ref: f.ref, type: f.type, fit: fitOf(def, f.type),
    name: f.ref === 'item' || f.ref === 'trigger' ? refName(f.ref, ctx, step.id) : ctx.outputs.get(f.ref) ?? f.ref,
  }))
}

function ChipList({ options, onPick, fixLabel }: { options: ChipOption[]; onPick: (ref: string) => void; fixLabel: (o: ChipOption) => string }) {
  const ok = options.filter((o) => o.fit !== 'no')
  const other = options.filter((o) => o.fit === 'no')
  if (!options.length) return null
  return (
    <div className="space-y-2" data-chip-options>
      {ok.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label={t('Values from earlier steps')}>
          {ok.map((o) => (
            <li key={o.ref}>
              <button type="button" className="touch-target rounded-chip" onClick={() => onPick(o.ref)} aria-label={t('Use {name} ({type})', { name: o.name, type: typeLabel(o.type) })}>
                <DataChip icon={o.ref === 'item' ? 'repeat' : 'corner-down-right'}>{o.name}</DataChip>
              </button>
            </li>
          ))}
        </ul>
      )}
      {other.length > 0 && (
        <div className="border-t border-default pt-2" data-needs-conversion>
          <p className="text-meta font-medium text-muted">{t('Needs conversion')}</p>
          <ul className="mt-1 space-y-1">
            {other.map((o) => (
              <li key={o.ref} className="flex flex-wrap items-center gap-2 text-meta text-muted">
                <button type="button" className="touch-target rounded-chip" onClick={() => onPick(o.ref)}><DataChip muted>{o.name}</DataChip></button>
                <span>{fixLabel(o)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** A text field with an Insert menu of chips and a character count. */
function TextPicker({ step, def, ctx, value, onSet }: { step: RoutineStep; def: StepInput; ctx: WordContext; value: string; onSet: (a: RoutineArg | undefined) => void }) {
  const [text, setText] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  const template = step.kind === 'format' && def.name === 'template'
  const insertable = chipOptions(step, def, ctx).filter((o) => o.type !== 'none')
  const save = (s: string) => {
    if (!s) return onSet(undefined)
    onSet({ literal: template || placeholders(s).length === 0 ? s : { format: s } })
  }
  const insert = (id: string) => {
    const el = ref.current
    const at = el?.selectionStart ?? text.length
    const next = `${text.slice(0, at)}{${id}}${text.slice(el?.selectionEnd ?? at)}`
    setText(next)
    save(next)
  }
  const max = def.max ?? 20000
  return (
    <div className="space-y-2">
      <Field label={inputLabel(def.name)} description={t('{n} of {max} characters', { n: Array.from(text).length, max })}>
        <textarea ref={ref} className="ui-input min-h-20 w-full" value={text} maxLength={max} autoFocus
          onChange={(e) => { setText(e.target.value); save(e.target.value) }} />
      </Field>
      {insertable.length > 0 && (
        <div>
          <p className="text-meta font-medium text-muted">{t('Insert')}</p>
          <ul className="mt-1 flex flex-wrap gap-1" aria-label={t('Insert a value')}>
            {insertable.map((o) => (
              <li key={o.ref}><button type="button" className="touch-target rounded-chip" onClick={() => insert(o.ref)} aria-label={t('Insert {name}', { name: o.name })}><DataChip>{o.name}</DataChip></button></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function DatePicker({ value, onSet }: { value: unknown; onSet: (a: RoutineArg | undefined) => void }) {
  const d = dateLiteral(value)
  const [days, setDays] = useState(d?.word === 'in_days' ? d.inDays ?? 7 : 7)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant={d?.word === 'today' ? 'primary' : 'secondary'} onClick={() => onSet({ literal: 'today' })}>{t('Today')}</Button>
        <Button size="sm" variant={d?.word === 'tomorrow' ? 'primary' : 'secondary'} onClick={() => onSet({ literal: 'tomorrow' })}>{t('Tomorrow')}</Button>
        <Button size="sm" variant={d?.word === 'in_days' && d.inDays === 7 ? 'primary' : 'secondary'} onClick={() => onSet({ literal: { in_days: 7 } })}>{t('Next week')}</Button>
      </div>
      <Field label={t('In days')}>
        <Input type="number" min={-365} max={365} value={days} onChange={(e) => { const n = Math.max(-365, Math.min(365, Math.trunc(Number(e.target.value) || 0))); setDays(n); onSet({ literal: { in_days: n } }) }} />
      </Field>
      <Field label={t('On a date')}>
        <Input type="date" value={d?.date ?? ''} onChange={(e) => onSet(e.target.value ? { literal: e.target.value } : undefined)} />
      </Field>
    </div>
  )
}

function ComparePicker({ value, onSet }: { value: unknown; onSet: (a: RoutineArg | undefined) => void }) {
  const [op0, x0] = Object.entries((value ?? {}) as Record<string, unknown>)[0] ?? ['>', 0]
  const [op, setOp] = useState(op0)
  const [x, setX] = useState(String(x0 === true ? '' : x0 ?? ''))
  const apply = (o: string, v: string) => {
    if (o === 'empty' || o === 'not_empty') return onSet({ literal: { [o]: true } })
    if (!v) return
    const n = Number(v)
    onSet({ literal: { [o]: o !== 'contains' && Number.isFinite(n) && v.trim() !== '' && !/^\d{4}-/.test(v) ? n : v } })
  }
  return (
    <div className="space-y-2">
      <Field label={t('Test')}>
        <select className="ui-input" value={op} onChange={(e) => { setOp(e.target.value); apply(e.target.value, x) }}>
          {Object.keys(COMPARE_LABEL).map((k) => <option key={k} value={k}>{COMPARE_LABEL[k]}</option>)}
        </select>
      </Field>
      {op !== 'empty' && op !== 'not_empty' && (
        <Field label={t('Value')}><Input value={x} onChange={(e) => { setX(e.target.value); apply(op, e.target.value) }} /></Field>
      )}
    </div>
  )
}

/** The literal editor of an input kind. */
function LiteralPicker({ step, def, ctx, onSet, me }: { step: RoutineStep; def: StepInput; ctx: WordContext; onSet: (a: RoutineArg | undefined) => void; me: string }) {
  const a = step.in?.[def.name]
  const v = a && 'literal' in a ? a.literal : undefined
  const n = ctx.names
  const encrypted = useEncryption().enabled
  const memberships = useMemberships()
  const shared = useMemo(() => new Set(memberships.map((m) => m.projectId)), [memberships])
  void me
  switch (def.literal) {
    case 'text': return <TextPicker step={step} def={def} ctx={ctx} value={textLiteral(v)?.text ?? ''} onSet={onSet} />
    case 'number':
      return <Field label={inputLabel(def.name)}><Input type="number" min={0} max={def.max} autoFocus value={typeof v === 'number' ? v : ''}
        onChange={(e) => onSet(e.target.value === '' ? undefined : { literal: Math.max(0, Math.min(def.max ?? 1e9, Number(e.target.value))) })} /></Field>
    case 'date': return <DatePicker value={v} onSet={onSet} />
    case 'project':
      return <Combobox label={inputLabel(def.name)} placeholder={t('Find a project…')} source={n.projects.filter((p) => !p.archived && !p.deleted_at)}
        getKey={(p) => p.id} getLabel={(p) => p.name} rankContext="routine.project" emptyText={t('No projects yet.')} onPick={(p) => onSet({ literal: { project: p.id } })} />
    case 'task':
      // A task chosen by hand is the rare fixed target: folded, last (routines-dynamic-data D4).
      return <SpecificTask label={inputLabel(def.name)} tasks={n.tasks} open={!!v} onPick={(x: Task) => onSet({ literal: { task: x.id } })} />
    case 'lines': {
      const text = Array.isArray(v) ? (v as string[]).join('\n') : ''
      return <Field label={t('One per line')}><textarea className="ui-input min-h-20 w-full" autoFocus defaultValue={text}
        onChange={(e) => { const lines = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean); onSet(lines.length ? { literal: lines } : undefined) }} /></Field>
    }
    case 'bool': return <Switch label={inputLabel(def.name)} checked={v === true} onChange={(on) => onSet({ literal: on })} />
    case 'enum':
      return (
        <div className="flex flex-wrap gap-1" role="group" aria-label={inputLabel(def.name)}>
          {def.enum!.map((x) => <Button key={x} size="sm" variant={v === x ? 'primary' : 'secondary'} onClick={() => onSet({ literal: x })}>{ENUM_LABEL[x] ?? x}</Button>)}
        </div>
      )
    case 'ids':
      return <Combobox label={inputLabel(def.name)} placeholder={t('Find a label…')} source={n.labels.filter((l) => !l.deleted_at)} getKey={(l) => l.id} getLabel={(l) => l.name}
        multiple selected={Array.isArray(v) ? (v as string[]) : []} rankContext="label" emptyText={t('No labels yet.')}
        onPick={(l) => { const ids = Array.isArray(v) ? (v as string[]) : []; const next = ids.includes(l.id) ? ids.filter((x) => x !== l.id) : [...ids, l.id]; onSet(next.length ? { literal: next } : undefined) }} />
    case 'id': {
      if (def.name === 'view') return <Combobox label={t('View')} placeholder={t('Find a view…')} source={n.views} getKey={(x) => x.id} getLabel={(x) => x.name} emptyText={t('No views yet.')} onPick={(x) => onSet({ literal: x.id })} />
      if (def.name === 'webhook_id') {
        if (!n.webhooks) return <p className="text-meta text-muted">{t('Your webhooks are listed when you are online.')}</p>
        return <Combobox label={t('Webhook')} placeholder={t('Find a webhook…')} source={n.webhooks.filter((w) => w.enabled !== false)} getKey={(w) => w.id} getLabel={(w) => w.url} emptyText={t('No webhooks yet.')} onPick={(w) => onSet({ literal: w.id })} />
      }
      if (def.name === 'section') {
        const pa = step.in?.project
        const pid = pa && 'literal' in pa ? (pa.literal as { project?: string }).project : ''
        return <Combobox label={t('Section')} placeholder={t('Find a section…')} source={n.sections.filter((s) => s.project_id === pid)} getKey={(x) => x.id} getLabel={(x) => x.name}
          emptyText={pid ? t('No sections in this project.') : t('Choose the project first.')} onPick={(x) => onSet({ literal: x.id })} />
      }
      return <Field label={inputLabel(def.name)}><Input autoFocus defaultValue={typeof v === 'string' ? v : ''} onChange={(e) => onSet(e.target.value ? { literal: e.target.value } : undefined)} /></Field>
    }
    case 'actions':
      return <ActionFields value={(v ?? {}) as RuleActions} onChange={(x) => onSet({ literal: x })} names={n} encrypted={encrypted} webhooks={n.webhooks} sharedProjects={shared} />
    case 'condition':
      return <ConditionFields value={(v ?? {}) as RuleCondition} onChange={(x) => onSet({ literal: x })} names={n} />
    case 'where': {
      const w = (v ?? {}) as Record<string, unknown>
      const listArg = step.in?.list
      const listType = listArg && 'ref' in listArg ? (listArg.ref === 'trigger' ? triggerOutput(ctx.draft.trigger.kind, !!ctx.draft.condition) : ctx.types[listArg.ref]) : undefined
      if (listType === 'lines') {
        return <Field label={t('Keep lines that contain')}><Input autoFocus defaultValue={String(w.contains ?? '')} onChange={(e) => onSet(e.target.value ? { literal: { contains: e.target.value } } : undefined)} /></Field>
      }
      return <ConditionFields value={w as RuleCondition} onChange={(x) => onSet({ literal: x })} names={n} />
    }
    case 'compare': return <ComparePicker value={v} onSet={onSet} />
    case 'period':
      return (
        <div className="flex flex-wrap gap-1" role="group" aria-label={t('Period')}>
          {Object.keys(PERIOD_LABEL).map((x) => <Button key={x} size="sm" variant={v === x ? 'primary' : 'secondary'} onClick={() => onSet({ literal: x })}>{PERIOD_LABEL[x]}</Button>)}
        </div>
      )
  }
  return null
}

/** One input's word button with its picker. */
export function InputWord({ step, def, ctx, error, me, onSet, onEdit, openRef }: {
  step: RoutineStep; def: StepInput; ctx: WordContext; error: boolean; me: string
  onSet: (a: RoutineArg | undefined) => void
  /** Applies a whole-draft edit (a conversion chosen under "Needs conversion"). */
  onEdit: (fn: (d: RoutineDraft) => RoutineDraft) => void
  /** Lets the editor open this word's picker ("Choose another value"). */
  openRef?: (open: () => void) => void
}) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  openRef?.(() => setOpen(true))
  const { shown, chip } = wordValue(step, def, ctx)
  const label = inputLabel(def.name, step.kind)
  const options = def.accepts.length ? chipOptions(step, def, ctx) : []
  const pickRef = (ref: string) => {
    const o = options.find((x) => x.ref === ref)
    // A value of another type comes with the conversion of the fix table (D5), as one edit.
    const fix = o?.fit === 'no' ? fixFor(withRef(ctx.draft, step.id, def.name, ref), { step: step.id, input: def.name, code: 'type_mismatch', message: `got ${typeName(o.type)}` }) : null
    if (fix?.kind === 'edit') onEdit((x) => fix.apply(withRef(x, step.id, def.name, ref)))
    else onSet({ ref })
    setOpen(false)
  }
  const fixLabel = (o: ChipOption) => {
    const fix = fixFor(withRef(ctx.draft, step.id, def.name, o.ref), { step: step.id, input: def.name, code: 'type_mismatch', message: `got ${typeName(o.type)}` })
    return fix?.label ?? t('No conversion')
  }
  return (
    <>
      <WordButton ref={anchor} label={label} value={shown} chip={chip} placeholder={wordPlaceholder(def)} error={error} action={t('change')} onClick={() => setOpen(true)} />
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} label={label} width="sm:w-96" className="max-h-[70dvh] space-y-3 overflow-y-auto p-3">
        <ChipList options={options} onPick={pickRef} fixLabel={fixLabel} />
        {(!def.literal || def.accepts.includes('task')) && <InsertAbove step={step} def={def} ctx={ctx} onEdit={onEdit} done={() => setOpen(false)} />}
        {def.literal && <LiteralPicker step={step} def={def} ctx={ctx} me={me} onSet={(x) => onSet(x)} />}
        <div className="flex justify-end gap-2">
          {step.in?.[def.name] && !def.required && <Button size="sm" variant="ghost" onClick={() => { onSet(undefined); setOpen(false) }}>{t('Remove')}</Button>}
          <Button size="sm" variant="primary" onClick={() => setOpen(false)}>{t('Done')}</Button>
        </div>
      </Popover>
    </>
  )
}

/**
 * A task chosen by hand, folded behind "A specific task…" at the end of a
 * picker (routines-dynamic-data D4): the rare fixed target, never the default.
 */
function SpecificTask({ label, tasks, open: initial, onPick }: { label: string; tasks: readonly Task[]; open: boolean; onPick: (x: Task) => void }) {
  const [open, setOpen] = useState(initial)
  if (!open) {
    return (
      <div className="border-t border-default pt-2" data-specific-task>
        <Button size="sm" variant="ghost" icon="chevron-right" onClick={() => setOpen(true)}>{t('A specific task…')}</Button>
      </div>
    )
  }
  return (
    <div className="space-y-1 border-t border-default pt-2" data-specific-task="open">
      <p className="text-meta text-muted">{t('Always this task, whatever the routine finds')}</p>
      <Combobox label={label} placeholder={t('Find a task…')} source={tasks.filter((x) => !x.deleted_at && !x.completed_at)}
        getKey={(x: Task) => x.id} getLabel={(x: Task) => x.title} emptyText={t('No tasks match.')} onPick={onPick} />
    </div>
  )
}

/**
 * Inputs can start from a step inserted above (D3): "Find tasks…" for a task
 * or tasks input, Find a project for a project input without a project picker;
 * the input then reads the new step. A task chosen by hand is never inserted
 * here (routines-dynamic-data D4).
 */
function InsertAbove({ step, def, ctx, onEdit, done }: { step: RoutineStep; def: StepInput; ctx: WordContext; onEdit: (fn: (d: RoutineDraft) => RoutineDraft) => void; done: () => void }) {
  const add = (inserted: (id: string) => RoutineStep) => {
    onEdit((d) => {
      const place = placeOf(d.steps, step.id)
      if (!place) return d
      const id = newId(d.steps)
      const steps = insertStep(d.steps, place, inserted(id))
      return { ...d, steps: setInput(steps, step.id, def.name, { ref: id }) }
    })
    done()
  }
  const n = ctx.names
  return (
    <div className="space-y-2 border-t border-default pt-2">
      {def.accepts.includes('project') && !def.literal && (
        <Combobox label={t('Choose a project')} placeholder={t('Find a project…')} source={n.projects.filter((p) => !p.archived && !p.deleted_at)}
          getKey={(p) => p.id} getLabel={(p) => p.name} rankContext="routine.project" emptyText={t('No projects yet.')}
          onPick={(p) => add((id) => ({ id, kind: 'find_project', in: { name: { literal: p.name } } }))} />
      )}
      {(def.accepts.includes('tasks') || def.accepts.includes('task')) && (
        <Button size="sm" variant="secondary" icon="search" onClick={() => add((id) => ({ id, kind: 'find_tasks', in: { condition: { literal: {} } } }))}>{t('Find tasks…')}</Button>
      )}
    </div>
  )
}

const typeName = (x: RoutineStepType): string => ({ text: 'Text', task: 'Task', tasks: 'Tasks', project: 'Project', date: 'Date', number: 'Number', lines: 'Lines', none: 'none' })[x]

function withRef(d: RoutineDraft, id: string, input: string, ref: string): RoutineDraft {
  const set = (list: RoutineStep[]): RoutineStep[] => list.map((s) => {
    const x: RoutineStep = s.id === id ? { ...s, in: { ...(s.in ?? {}), [input]: { ref } } } : { ...s }
    if (s.then) x.then = set(s.then)
    if (s.otherwise) x.otherwise = set(s.otherwise)
    if (s.do) x.do = set(s.do)
    return x
  })
  return { ...d, steps: set(d.steps) }
}

/** The extra words of a card ("· due tomorrow"): set optional inputs after the sentence. */
export function inputDefs(step: RoutineStep, names: readonly string[]): StepInput[] {
  const k = stepKind(step.kind)
  return names.map((n) => k?.inputs.find((d) => d.name === n)).filter((d): d is StepInput => !!d)
}

/** A small wrapper giving a label to a group of words. */
export function Words({ children }: { children: ReactNode }) {
  return <span className="text-body text-default">{children}</span>
}
