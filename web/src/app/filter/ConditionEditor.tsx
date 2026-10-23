// The condition dialog of the filter builder (OpenSpec change filter-builder,
// design D4): what to filter on, then its value with the app's own pickers.
import { useMemo, useState } from 'react'
import { Button, Combobox, Dialog, Field, Input, NeutralChip, Select, Switch } from '../../ui'
import { parse, type DateExpr } from '../../lib/filter'
import { formatDate, formatMinutes, type Leaf } from '../../lib/filter/builder'
import { type Cmp, type DateField, type Keyword, type Priority } from '../../lib/filter/parse'
import { durationMinutes } from '../../lib/time'
import { ancestors } from '../../lib/tree'
import type { FieldDef, Label, Project } from '../../lib/types'
import { msg, t, translatedMap } from '../../lib/i18n'
import { KEYWORD_NAME } from './conditionText'

export type ConditionKind = 'label' | 'project' | 'priority' | DateField | 'state' | 'search' | 'origin' | 'tracked' | 'field' | 'nofield'

const KIND_NAME = translatedMap<ConditionKind>({
  label: msg('Label'), project: msg('Project'), priority: msg('Priority'),
  due: msg('Due date'), deadline: msg('Deadline'), start: msg('Start date'), created: msg('Created'), completed: msg('Completed date'),
  state: msg('State'), search: msg('Title or notes'), origin: msg('Origin'), tracked: msg('Tracked time'),
  field: msg('Custom field'), nofield: msg('Custom field is empty'),
})

type When = 'today' | 'tomorrow' | 'yesterday' | 'this-week' | 'next-week' | 'last-week' | 'this-month' | 'next-month' | 'last-month' | 'days-ahead' | 'days-ago' | 'weeks-ago' | 'months-ago' | 'weekday' | 'date'

const WHEN_NAME = translatedMap<When>({
  today: msg('Today'), tomorrow: msg('Tomorrow'), yesterday: msg('Yesterday'),
  'this-week': msg('This week'), 'next-week': msg('Next week'), 'last-week': msg('Last week'),
  'this-month': msg('This month'), 'next-month': msg('Next month'), 'last-month': msg('Last month'),
  'days-ahead': msg('In a number of days'), 'days-ago': msg('A number of days ago'),
  'weeks-ago': msg('A number of weeks ago'), 'months-ago': msg('A number of months ago'),
  weekday: msg('A day of the week'), date: msg('A specific date'),
})

const DATE_OP_NAME = translatedMap<Cmp>({ '<': msg('before'), '<=': msg('on or before'), '=': msg('on'), '>=': msg('on or after'), '>': msg('after') })
const AMOUNT_OP_NAME = translatedMap<Cmp>({ '<': msg('less than'), '<=': msg('at most'), '=': msg('exactly'), '>=': msg('at least'), '>': msg('more than') })
const CMPS: Cmp[] = ['<', '<=', '=', '>=', '>']
const WEEKDAY_NAME = [msg('Sunday'), msg('Monday'), msg('Tuesday'), msg('Wednesday'), msg('Thursday'), msg('Friday'), msg('Saturday')]

export interface Draft {
  kind: ConditionKind
  name: string
  descendants: boolean
  priority: Priority
  op: Cmp
  when: When
  n: string
  weekday: number
  iso: string
  keyword: Keyword
  text: string
  duration: string
  value: string
}

const DATE_KINDS: readonly string[] = ['due', 'deadline', 'start', 'created', 'completed']

function whenOf(d: DateExpr): Pick<Draft, 'when' | 'n' | 'weekday' | 'iso'> {
  const base = { n: '3', weekday: 1, iso: '' }
  switch (d.type) {
    case 'iso': return { ...base, when: 'date', iso: d.date }
    case 'weekday': return { ...base, when: 'weekday', weekday: d.day }
    case 'relative':
      if (d.days === 0) return { ...base, when: 'today' }
      if (d.days === 1) return { ...base, when: 'tomorrow' }
      if (d.days === -1) return { ...base, when: 'yesterday' }
      return { ...base, when: d.days > 0 ? 'days-ahead' : 'days-ago', n: String(Math.abs(d.days)) }
    case 'period': {
      const named = { 0: 'this', 1: 'next', [-1]: 'last' } as Record<number, string>
      if (named[d.offset]) return { ...base, when: `${named[d.offset]}-${d.unit}` as When }
      return { ...base, when: d.unit === 'week' ? 'weeks-ago' : 'months-ago', n: String(-d.offset) }
    }
  }
}

function dateOf(d: Draft): DateExpr | null {
  const n = Number(d.n)
  const count = Number.isInteger(n) && n >= 0 && d.n.trim() !== '' ? n : null
  switch (d.when) {
    case 'today': return { type: 'relative', days: 0 }
    case 'tomorrow': return { type: 'relative', days: 1 }
    case 'yesterday': return { type: 'relative', days: -1 }
    case 'this-week': return { type: 'period', unit: 'week', offset: 0 }
    case 'next-week': return { type: 'period', unit: 'week', offset: 1 }
    case 'last-week': return { type: 'period', unit: 'week', offset: -1 }
    case 'this-month': return { type: 'period', unit: 'month', offset: 0 }
    case 'next-month': return { type: 'period', unit: 'month', offset: 1 }
    case 'last-month': return { type: 'period', unit: 'month', offset: -1 }
    case 'days-ahead': return count === null ? null : { type: 'relative', days: count }
    case 'days-ago': return count === null ? null : { type: 'relative', days: -count }
    case 'weeks-ago': return count === null || count < 2 ? null : { type: 'period', unit: 'week', offset: -count }
    case 'months-ago': return count === null || count < 2 ? null : { type: 'period', unit: 'month', offset: -count }
    case 'weekday': return { type: 'weekday', day: d.weekday }
    case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(d.iso) ? { type: 'iso', date: d.iso } : null
  }
}

export function draftOf(leaf: Leaf | null): Draft {
  const d: Draft = {
    kind: 'label', name: '', descendants: false, priority: 1, op: '<=', when: 'today', n: '3', weekday: 1, iso: '',
    keyword: 'overdue', text: '', duration: '', value: '',
  }
  if (!leaf) return d
  switch (leaf.kind) {
    case 'label': return { ...d, kind: 'label', name: leaf.name }
    case 'project': return { ...d, kind: 'project', name: leaf.name, descendants: leaf.descendants }
    case 'priority': return { ...d, kind: 'priority', priority: leaf.value }
    case 'date': return { ...d, kind: leaf.field, op: leaf.op, ...whenOf(leaf.date) }
    case 'keyword': return { ...d, kind: 'state', keyword: leaf.keyword }
    case 'search': return { ...d, kind: 'search', text: leaf.text }
    case 'origin': return { ...d, kind: 'origin', text: leaf.value }
    case 'tracked': return { ...d, kind: 'tracked', op: leaf.op, duration: formatMinutes(leaf.minutes) }
    case 'field': {
      const v = leaf.value
      const value = v.type === 'text' ? v.value : v.type === 'date' ? formatDate(v.date) : String(v.value)
      return { ...d, kind: 'field', name: leaf.name, op: leaf.op, value }
    }
    case 'nofield': return { ...d, kind: 'nofield', name: leaf.name }
  }
}

function quoted(s: string): string {
  return `"${s.replace(/["\\]/g, (c) => '\\' + c)}"`
}

/** The leaf a draft describes, or null while it is incomplete. */
export function leafOf(d: Draft): Leaf | null {
  const name = d.name.trim()
  switch (d.kind) {
    case 'label': return name ? { kind: 'label', name, pos: 0 } : null
    case 'project': return name ? { kind: 'project', name, descendants: d.descendants, pos: 0 } : null
    case 'priority': return { kind: 'priority', value: d.priority }
    case 'state': return { kind: 'keyword', keyword: d.keyword }
    case 'search': return d.text.trim() ? { kind: 'search', text: d.text.trim() } : null
    case 'origin': return d.text.trim() ? { kind: 'origin', value: d.text.trim() } : null
    case 'tracked': {
      const minutes = durationMinutes(d.duration)
      return minutes === null ? null : { kind: 'tracked', op: d.op, minutes }
    }
    case 'nofield': return name ? { kind: 'nofield', name, pos: 0 } : null
    case 'field': {
      const value = d.value.trim()
      if (!name || !value) return null
      // The grammar decides the value's type: a number, true or false, a date, or text.
      for (const v of [value, quoted(value)]) {
        try {
          const node = parse(`${quoted(name)} ${d.op} ${v}`)
          if (node?.kind === 'field') return node
        } catch { /* try it quoted */ }
      }
      return null
    }
    default: {
      if (!DATE_KINDS.includes(d.kind)) return null
      const date = dateOf(d)
      return date ? { kind: 'date', field: d.kind as DateField, op: d.op, date } : null
    }
  }
}

export interface ConditionEditorProps {
  /** The condition being edited; null to add one. */
  leaf: Leaf | null
  not: boolean
  labels: readonly Label[]
  projects: readonly Project[]
  fields: readonly FieldDef[]
  onSave: (leaf: Leaf, not: boolean) => void
  onRemove?: () => void
  onClose: () => void
}



export function ConditionEditor({ leaf, not: initialNot, labels, projects, fields, onSave, onRemove, onClose }: ConditionEditorProps) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(leaf))
  const [not, setNot] = useState(initialNot)
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const result = leafOf(draft)
  const fieldNames = useMemo(() => [...new Set(fields.filter((f) => !f.deleted_at).map((f) => f.name))].sort((a, b) => a.localeCompare(b)), [fields])
  const kinds: ConditionKind[] = ['label', 'project', 'priority', 'due', 'deadline', 'start', 'created', 'completed', 'state', 'search', 'origin', 'tracked']
  if (fieldNames.length || draft.kind === 'field' || draft.kind === 'nofield') kinds.push('field', 'nofield')
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const isDate = DATE_KINDS.includes(draft.kind)
  const save = () => { if (result) onSave(result, not) }

  return (
    <Dialog title={leaf ? t('Edit condition') : t('Add condition')} onClose={onClose} size="sm" placement="sheet" testId="condition-editor">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save() }}>
        <Field label={t('Filter on')}>
          <Select value={draft.kind} onChange={(e) => set({ kind: e.target.value as ConditionKind, op: e.target.value === 'tracked' ? '>' : '<=' })}>
            {kinds.map((k) => <option key={k} value={k}>{KIND_NAME[k]}</option>)}
          </Select>
        </Field>

        {(draft.kind === 'label' || draft.kind === 'project') && (
          <div className="space-y-2">
            {draft.name && <p className="text-meta text-muted">{t('Chosen:')} <NeutralChip>{draft.name}</NeutralChip></p>}
            {draft.kind === 'label' ? (
              <Combobox label={t('Choose a label')} placeholder={t('Search labels')} source={labels.filter((l) => !l.deleted_at)}
                getKey={(l) => l.id} getLabel={(l) => l.name} rankContext="label" selected={labels.filter((l) => l.name === draft.name).map((l) => l.id)}
                onPick={(l) => set({ name: l.name })} />
            ) : (
              <Combobox label={t('Choose a project')} placeholder={t('Search projects')} source={projects.filter((p) => !p.deleted_at)}
                getKey={(p) => p.id} getLabel={(p) => p.name} getPath={(p) => ancestors(p.id, projectMap).reverse().map((a) => a.name)}
                selected={projects.filter((p) => p.name === draft.name).map((p) => p.id)} onPick={(p) => set({ name: p.name })} />
            )}
            {draft.kind === 'project' && (
              <Switch checked={draft.descendants} onChange={(v) => set({ descendants: v })} label={t('Include sub-projects')} />
            )}
          </div>
        )}

        {draft.kind === 'priority' && (
          <div role="group" aria-label={t('Priority')} className="flex flex-wrap gap-2">
            {([1, 2, 3, 4] as Priority[]).map((p) => (
              <Button key={p} variant={draft.priority === p ? 'primary' : 'secondary'} aria-pressed={draft.priority === p} onClick={() => set({ priority: p })}>
                {`P${p}`}
              </Button>
            ))}
          </div>
        )}

        {isDate && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('Comparison')}>
              <Select value={draft.op} onChange={(e) => set({ op: e.target.value as Cmp })}>
                {CMPS.map((c) => <option key={c} value={c}>{DATE_OP_NAME[c]}</option>)}
              </Select>
            </Field>
            <Field label={t('When')}>
              <Select value={draft.when} onChange={(e) => set({ when: e.target.value as When })}>
                {(Object.keys(WHEN_NAME) as When[]).map((w) => <option key={w} value={w}>{WHEN_NAME[w]}</option>)}
              </Select>
            </Field>
            {(draft.when === 'days-ahead' || draft.when === 'days-ago' || draft.when === 'weeks-ago' || draft.when === 'months-ago') && (
              <Field label={draft.when === 'weeks-ago' ? t('Number of weeks') : draft.when === 'months-ago' ? t('Number of months') : t('Number of days')}>
                <Input type="number" min={draft.when.endsWith('-ago') && draft.when !== 'days-ago' ? 2 : 0} value={draft.n} onChange={(e) => set({ n: e.target.value })} />
              </Field>
            )}
            {draft.when === 'weekday' && (
              <Field label={t('Day of the week')}>
                <Select value={draft.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })}>
                  {WEEKDAY_NAME.map((w, i) => <option key={w} value={i}>{t(w)}</option>)}
                </Select>
              </Field>
            )}
            {draft.when === 'date' && (
              <Field label={t('Date')}>
                <Input type="date" value={draft.iso} onChange={(e) => set({ iso: e.target.value })} />
              </Field>
            )}
          </div>
        )}

        {draft.kind === 'state' && (
          <Field label={t('State')}>
            <Select value={draft.keyword} onChange={(e) => set({ keyword: e.target.value as Keyword })}>
              {(Object.keys(KEYWORD_NAME) as Keyword[]).map((k) => <option key={k} value={k}>{KEYWORD_NAME[k]}</option>)}
            </Select>
          </Field>
        )}

        {(draft.kind === 'search' || draft.kind === 'origin') && (
          <Field label={draft.kind === 'search' ? t('Text in the title or notes') : t('Provider or kind')}
            description={draft.kind === 'origin' ? t('For example github, gitlab, url, email or import') : undefined}>
            <Input value={draft.text} onChange={(e) => set({ text: e.target.value })} autoComplete="off" spellCheck={false} />
          </Field>
        )}

        {draft.kind === 'tracked' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('Comparison')}>
              <Select value={draft.op} onChange={(e) => set({ op: e.target.value as Cmp })}>
                {CMPS.map((c) => <option key={c} value={c}>{AMOUNT_OP_NAME[c]}</option>)}
              </Select>
            </Field>
            <Field label={t('Duration')} description={t('For example 30m, 1h or 1h30')}>
              <Input value={draft.duration} onChange={(e) => set({ duration: e.target.value })} autoComplete="off" spellCheck={false} />
            </Field>
          </div>
        )}

        {(draft.kind === 'field' || draft.kind === 'nofield') && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('Field')}>
              <Select value={draft.name} onChange={(e) => set({ name: e.target.value })}>
                <option value="">{t('Choose a field')}</option>
                {[...new Set([...fieldNames, draft.name].filter(Boolean))].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
            {draft.kind === 'field' && (
              <>
                <Field label={t('Comparison')}>
                  <Select value={draft.op} onChange={(e) => set({ op: e.target.value as Cmp })}>
                    {CMPS.map((c) => <option key={c} value={c}>{AMOUNT_OP_NAME[c]}</option>)}
                  </Select>
                </Field>
                <Field label={t('Value')} description={t('A number, true or false, a date such as tomorrow, or text')}>
                  <Input value={draft.value} onChange={(e) => set({ value: e.target.value })} autoComplete="off" spellCheck={false} />
                </Field>
              </>
            )}
          </div>
        )}

        <Switch checked={not} onChange={setNot} label={t('Not')} description={t('Match the tasks this condition does not match')} />

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {onRemove && <Button variant="danger" onClick={onRemove}>{t('Remove')}</Button>}
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="primary" type="submit" disabled={!result}>{leaf ? t('Save') : t('Add')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
