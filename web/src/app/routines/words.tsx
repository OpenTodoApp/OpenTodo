// The word buttons of a step card and their pickers (OpenSpec change
// routines-editor, design D3): what an input reads ("Errands", "the lines",
// "choose a project"), and the picker each input kind opens: chips of earlier
// outputs (nearest first, "Needs conversion" below a divider), the Combobox for
// projects, labels, views, tasks and webhooks, fields for text, numbers and
// dates, the rule condition and action controls.
import { useMemo, useState, type ReactNode } from 'react'
import { useEncryption } from '../../lib/e2ee'
import { formatList, msg, t, translatedMap } from '../../lib/i18n'
import { useMemberships } from '../../lib/localData'
import { enclosingRepeat, fitOf, flowingTo, type RoutineDraft } from '../../lib/rules/draft'
import { inputLabel, itemName, triggerOutputName } from '../../lib/rules/sentence'
import { actionParts, conditionParts } from '../../lib/rules/summary'
import { dateLiteral, stepKind, textLiteral, triggerOutput, type StepInput } from '../../lib/rules/steps'
import type { RoutineArg, RoutineStep, RoutineStepType, RuleActions, RuleCondition } from '../../lib/types'
import { Button, Combobox, Field, Input, Switch } from '../../ui'
import { ActionFields, ConditionFields } from '../rules/RuleFields'
import type { RoutineNames } from './data'

export const ENUM_LABEL = translatedMap<string>({
  deep: msg('Deep'), medium: msg('Medium'), low: msg('Low'), due: msg('date'), deadline: msg('deadline'), priority: msg('priority'), created: msg('creation'),
  title: msg('title'), text: msg('text'), asc: msg('ascending'), desc: msg('descending'), start: msg('the start'), end: msg('the end'),
  lines: msg('lines'), short: msg('short'),
})
export const PERIOD_LABEL = translatedMap<string>({ today: msg('today'), this_week: msg('this week'), last_week: msg('last week'), this_month: msg('this month') })
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

export interface ChipOption { ref: string; name: string; type: RoutineStepType; fit: 'yes' | 'each' | 'no' }

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

export function DatePicker({ value, onSet }: { value: unknown; onSet: (a: RoutineArg | undefined) => void }) {
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

export function ComparePicker({ value, onSet }: { value: unknown; onSet: (a: RoutineArg | undefined) => void }) {
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

/** The literal editor of an input kind, for the editors under a list or in a card (pickers.tsx). */
export function LiteralPicker({ step, def, ctx, onSet, me }: { step: RoutineStep; def: StepInput; ctx: WordContext; onSet: (a: RoutineArg | undefined) => void; me: string }) {
  const a = step.in?.[def.name]
  const v = a && 'literal' in a ? a.literal : undefined
  const n = ctx.names
  const encrypted = useEncryption().enabled
  const memberships = useMemberships()
  const shared = useMemo(() => new Set(memberships.map((m) => m.projectId)), [memberships])
  void me
  switch (def.literal) {
    case 'number':
      return <Field label={inputLabel(def.name)}><Input type="number" min={0} max={def.max} autoFocus value={typeof v === 'number' ? v : ''}
        onChange={(e) => onSet(e.target.value === '' ? undefined : { literal: Math.max(0, Math.min(def.max ?? 1e9, Number(e.target.value))) })} /></Field>
    case 'date': return <DatePicker value={v} onSet={onSet} />
    case 'project':
      return <Combobox label={inputLabel(def.name)} placeholder={t('Find a project…')} source={n.projects.filter((p) => !p.archived && !p.deleted_at)}
        getKey={(p) => p.id} getLabel={(p) => p.name} rankContext="routine.project" emptyText={t('No projects yet.')} onPick={(p) => onSet({ literal: { project: p.id } })} />
    case 'bool': return <Switch label={inputLabel(def.name, step.kind)} checked={v === true} onChange={(on) => onSet({ literal: on })} />
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

/** The extra words of a card ("· due tomorrow"): set optional inputs after the sentence. */
export function inputDefs(step: RoutineStep, names: readonly string[]): StepInput[] {
  const k = stepKind(step.kind)
  return names.map((n) => k?.inputs.find((d) => d.name === n)).filter((d): d is StepInput => !!d)
}

/** A small wrapper giving a label to a group of words. */
export function Words({ children }: { children: ReactNode }) {
  return <span className="text-body text-default">{children}</span>
}
