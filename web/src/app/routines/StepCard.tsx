// A routine's sentence cards (OpenSpec change routines-editor, design D2, D4,
// D5, D7 and D13): the When card, and one card per step read as a sentence whose
// inputs are word buttons, with its output line, its live preview, its error and
// one-tap fix, "Not available" with a link, a menu (move, duplicate, delete, add
// an input), and If / Repeat blocks indented under it.
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { t } from '../../lib/i18n'
import type { Catalogue } from '../../lib/rules/catalogue'
import { isAvailable, reasonText, settingPath } from '../../lib/rules/catalogue'
import type { RoutineDraft } from '../../lib/rules/draft'
import type { Fix } from '../../lib/rules/fixes'
import { roundEstimate } from '../../lib/rules/ai'
import { previewLines, type Preview } from '../../lib/rules/preview'
import { addableInputs, countText, extraInputs, inputLabel, sentenceParts, stepName } from '../../lib/rules/sentence'
import { conditionParts, triggerText } from '../../lib/rules/summary'
import { stepKind } from '../../lib/rules/steps'
import type { RoutineArg, RoutineStep, RuleCondition, RuleTrigger } from '../../lib/types'
import { Badge, Button, DataChip, Icon, Popover, WordButton } from '../../ui'
import { ActionMenu, type ActionGroup } from '../menus/ActionMenu'
import { ConditionFields, TriggerFields } from '../rules/RuleFields'
import { useMatchCount } from './data'
import { InputWord, inputDefs, wordValue, type WordContext } from './words'

export interface CardEvents {
  set: (id: string, input: string, arg: RoutineArg | undefined) => void
  edit: (fn: (d: RoutineDraft) => RoutineDraft) => void
  move: (id: string, delta: -1 | 1) => void
  duplicate: (id: string) => void
  remove: (id: string) => void
  addBelow: (id: string) => void
  addIn: (parent: string, block: 'then' | 'otherwise' | 'do') => void
  fix: (f: Fix) => void
}

export interface CardState {
  ctx: WordContext
  catalogue: Catalogue | null
  previews: Map<string, Preview>
  online: boolean
  error: { step: string; input: string; text: string; fix: Fix | null } | null
  me: string
  /** The editor registers each word's opener for "Choose another value". */
  openers: Map<string, () => void>
}

/** The plain sentence of a step, for its group's name and its announcement. */
export function sentenceText(step: RoutineStep, ctx: WordContext): string {
  const k = stepKind(step.kind)
  return sentenceParts(step).map((p) => {
    if ('text' in p) return p.text
    const def = k?.inputs.find((d) => d.name === p.slot)
    return def ? wordValue(step, def, ctx).shown || '…' : ''
  }).join('').replace(/\s+/g, ' ').trim()
}

function PreviewBlock({ p, ctx, online }: { p: Preview | undefined; ctx: WordContext; online: boolean }) {
  if (!p || p.state === 'unknown') return null
  if (p.state === 'skipped') return <p className="text-meta text-faint" data-preview="skipped">{t('Not run in this preview')}</p>
  if (p.state === 'server') return <p className="text-meta text-faint" data-preview="server">{online ? t('Preview loading…') : t('Preview needs a connection')}</p>
  if (p.state === 'ai') {
    return <p className="text-meta text-muted" data-preview="ai">{t('The AI answer appears when you Test · about {n} tokens', { n: roundEstimate(p.estimate) })}</p>
  }
  if (p.state === 'effect') {
    const over = p.n !== undefined && p.max !== undefined && p.n > p.max
    return (
      <p className={`text-meta ${over ? 'text-danger' : 'text-muted'}`} data-preview="effect">
        {over ? t('Would write {n} of {max}', { n: p.n!, max: p.max! }) : p.text}
      </p>
    )
  }
  const lines = previewLines(p.value, (id) => ctx.names.title(id) || t('Deleted task'), (id) => ctx.names.projectName(id) || t('a removed project'))
  if (lines.single !== undefined) return <p className="text-meta text-muted" data-preview="value">{lines.single}</p>
  if (!lines.items.length) return <p className="text-meta text-faint" data-preview="value">{t('Nothing')}</p>
  return (
    <ul className="space-y-0.5 text-meta text-muted" data-preview="value">
      {lines.items.map((x, i) => <li key={i} className="user-text truncate">{x}</li>)}
      {lines.more > 0 && <li className="text-faint">{t('+ {n} more', { n: lines.more })}</li>}
    </ul>
  )
}

function OutputLine({ step, state }: { step: RoutineStep; state: CardState }) {
  const name = state.ctx.outputs.get(step.id)
  const type = state.ctx.types[step.id]
  if (!name || !type || type === 'none') return null
  const p = state.previews.get(step.id)
  const count = p?.state === 'value' ? (p.value.type === 'tasks' ? p.value.ids?.length ?? 0 : p.value.type === 'lines' ? p.value.lines?.length ?? 0 : null) : null
  return (
    <p className="flex flex-wrap items-center gap-1 text-meta text-muted" data-output>
      <Icon name="arrow-right" size="xs" />
      <DataChip>{name}</DataChip>
      {count !== null && <span>{countText(p!.state === 'value' ? p!.value.type : type, count)}</span>}
    </p>
  )
}

/** The words of a step: the sentence with its slots, then its extra set inputs. */
function StepWords({ step, state, events, adding }: { step: RoutineStep; state: CardState; events: CardEvents; adding: readonly string[] }) {
  const k = stepKind(step.kind)
  const word = (name: string) => {
    const def = k?.inputs.find((d) => d.name === name)
    if (!def) return null
    return (
      <InputWord key={name} step={step} def={def} ctx={state.ctx} me={state.me} error={state.error?.step === step.id && state.error.input === name}
        onSet={(a) => events.set(step.id, name, a)} onEdit={events.edit} openRef={(open) => state.openers.set(`${step.id}.${name}`, open)} />
    )
  }
  return (
    <>
      {sentenceParts(step).map((p, i) => ('text' in p ? <span key={i}>{p.text}</span> : word(p.slot)))}
      {inputDefs(step, [...extraInputs(step), ...adding.filter((n) => !(step.in && n in step.in))]).map((d) => (
        <span key={d.name} className="text-muted"> · {inputLabel(d.name)}{word(d.name)}</span>
      ))}
    </>
  )
}

function Lane({ title, steps, parent, block, state, events, depth }: {
  title: string; steps: RoutineStep[]; parent: string; block: 'then' | 'otherwise' | 'do'; state: CardState; events: CardEvents; depth: number
}) {
  return (
    <div className="ml-3 space-y-2 border-l-2 border-default pl-3" data-lane={block} role="group" aria-label={title}>
      <p className="text-meta font-medium text-muted">{title}</p>
      {steps.map((s, i) => <StepCard key={s.id} step={s} index={i} total={steps.length} state={state} events={events} depth={depth + 1} />)}
      <Button size="sm" variant="ghost" icon="plus" onClick={() => events.addIn(parent, block)}>{t('Add step')}</Button>
    </div>
  )
}

/** Keys of a focused card (D13): Alt+↑/↓ move it, Delete asks to delete it, `a` adds a step below. */
function cardKeys(e: KeyboardEvent<HTMLElement>, step: RoutineStep, events: CardEvents, askDelete: () => void) {
  if (e.target !== e.currentTarget) return
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault()
    events.move(step.id, e.key === 'ArrowUp' ? -1 : 1)
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    askDelete()
  } else if (e.key === 'a' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault()
    events.addBelow(step.id)
  }
}

export function StepCard({ step, index, total, state, events, depth = 0 }: {
  step: RoutineStep; index: number; total: number; state: CardState; events: CardEvents; depth?: number
}) {
  const [confirm, setConfirm] = useState(false)
  const [adding, setAdding] = useState<string[]>([])
  const k = stepKind(step.kind)
  const cat = state.catalogue?.[step.kind]
  const available = isAvailable(state.catalogue, step.kind)
  const sentence = sentenceText(step, state.ctx)
  const err = state.error?.step === step.id ? state.error : null
  const groups: ActionGroup[] = [
    { items: [
      { kind: 'action', id: 'up', label: t('Move up'), icon: 'arrow-up', disabled: index === 0, onSelect: () => events.move(step.id, -1) },
      { kind: 'action', id: 'down', label: t('Move down'), icon: 'arrow-down', disabled: index === total - 1, onSelect: () => events.move(step.id, 1) },
      { kind: 'action', id: 'below', label: t('Add step below'), icon: 'plus', onSelect: () => events.addBelow(step.id) },
      { kind: 'action', id: 'duplicate', label: t('Duplicate'), icon: 'copy', onSelect: () => events.duplicate(step.id) },
    ] },
    ...(addableInputs(step).length ? [{ items: addableInputs(step).map((name) => ({
      kind: 'action' as const, id: `add-${name}`, label: t('Add {input}', { input: inputLabel(name).toLocaleLowerCase() }), icon: 'plus' as const,
      onSelect: () => {
        const arg = defaultArg(step, name)
        if (arg) events.set(step.id, name, arg)
        else setAdding((xs) => [...xs, name])
        setTimeout(() => state.openers.get(`${step.id}.${name}`)?.(), 0)
      },
    })) }] : []),
    { items: [{ kind: 'action', id: 'delete', label: t('Delete step'), icon: 'trash-2', tone: 'danger', onSelect: () => setConfirm(true) }] },
  ]
  return (
    <section className={`surface-card space-y-1 p-3 outline-none focus-visible:ring-2 focus-visible:ring-accent ${err ? 'border-danger' : ''}`} tabIndex={0}
      role="group" aria-label={sentence} data-step-card={step.id} data-step-kind={step.kind} data-word-group
      onKeyDown={(e) => cardKeys(e, step, events, () => setConfirm(true))}>
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 leading-8 text-body text-default"><StepWords step={step} state={state} events={events} adding={adding} /></p>
        <ActionMenu label={t('Menu for step {name}', { name: stepName(step.kind) })} groups={groups} />
      </div>
      {!available && (
        <p className="flex flex-wrap items-center gap-2 text-meta" data-unavailable>
          <Badge hue="orange">{t('Not available: {reason}', { reason: reasonText(cat?.reason) })}</Badge>
          {settingPath(cat?.setting) && <a className="text-accent underline" href={settingPath(cat?.setting)}>{t('Open the setting')}</a>}
        </p>
      )}
      {err && (
        <p className="flex flex-wrap items-center gap-2 text-meta text-danger" role="alert" data-step-error>
          <span>{err.text}</span>
          {err.fix && <Button size="sm" variant="secondary" onClick={() => events.fix(err.fix!)}>{err.fix.label}</Button>}
        </p>
      )}
      <OutputLine step={step} state={state} />
      <PreviewBlock p={state.previews.get(step.id)} ctx={state.ctx} online={state.online} />
      {k?.blocks?.includes('then') && <Lane title={t('Then')} steps={step.then ?? []} parent={step.id} block="then" state={state} events={events} depth={depth} />}
      {k?.blocks?.includes('otherwise') && <Lane title={t('Otherwise')} steps={step.otherwise ?? []} parent={step.id} block="otherwise" state={state} events={events} depth={depth} />}
      {k?.blocks?.includes('do') && <Lane title={t('For each item')} steps={step.do ?? []} parent={step.id} block="do" state={state} events={events} depth={depth} />}
      {confirm && (
        <ConfirmInline text={t('Delete “{name}”?', { name: stepName(step.kind) })} onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); events.remove(step.id) }} />
      )}
    </section>
  )
}

/** A default value for an optional input added from the menu. */
function defaultArg(step: RoutineStep, name: string): RoutineArg | undefined {
  const def = stepKind(step.kind)?.inputs.find((d) => d.name === name)
  switch (def?.literal) {
    case 'number': return { literal: def.max && def.max < 10 ? def.max : 10 }
    case 'date': return { literal: 'today' }
    case 'bool': return { literal: true }
    case 'enum': return { literal: def.enum![0] }
    case 'period': return { literal: 'this_week' }
  }
  return undefined
}

function ConfirmInline({ text, onCancel, onConfirm }: { text: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-control bg-sunken p-2 text-meta" role="alertdialog" aria-label={text}>
      <span className="flex-1">{text}</span>
      <Button size="sm" variant="ghost" onClick={onCancel} autoFocus>{t('Cancel')}</Button>
      <Button size="sm" variant="danger" onClick={onConfirm}>{t('Delete step')}</Button>
    </div>
  )
}

/** The When card: the trigger and its conditions as words (D2), edited with the rule dialog's controls. */
export function WhenCard({ trigger, condition, ctx, me, onTrigger, onCondition }: {
  trigger: RuleTrigger; condition: RuleCondition | null; ctx: WordContext; me: string
  onTrigger: (t: RuleTrigger) => void; onCondition: (c: RuleCondition | null) => void
}) {
  const [open, setOpen] = useState<'' | 'trigger' | 'condition'>('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const condRef = useRef<HTMLButtonElement>(null)
  const names = ctx.names
  const phrase = triggerText(trigger, names)
  const cond = conditionParts(condition, names).join(', ')
  const count = useMatchCount(condition, me)
  const shared = new Set<string>()
  return (
    <section className="surface-card space-y-1 p-3" role="group" aria-label={`${phrase}${cond ? ` · ${cond}` : ''}`} data-when-card data-word-group>
      <p className="leading-8 text-body text-default">
        <WordButton ref={triggerRef} label={t('When')} value={phrase.charAt(0).toLocaleUpperCase() + phrase.slice(1)} placeholder={t('choose when')} action={t('change')} onClick={() => setOpen('trigger')} />
        {trigger.kind !== 'manual' && (
          <>
            <span> {t('if')} </span>
            <WordButton ref={condRef} label={t('Condition')} value={cond} placeholder={t('any task')} action={t('change')} onClick={() => setOpen('condition')} />
          </>
        )}
      </p>
      {trigger.kind !== 'manual' && (
        <p className="text-meta text-muted" data-rule-count>{t('{n, plural, one {# open task matches now} other {# open tasks match now}}', { n: count })}</p>
      )}
      <Popover open={open === 'trigger'} onClose={() => setOpen('')} anchor={triggerRef} label={t('When')} width="sm:w-96" className="p-3">
        <TriggerFields value={trigger} onChange={onTrigger} names={names} sharedProjects={shared} />
        <div className="mt-2 flex justify-end"><Button size="sm" variant="primary" onClick={() => setOpen('')}>{t('Done')}</Button></div>
      </Popover>
      <Popover open={open === 'condition'} onClose={() => setOpen('')} anchor={condRef} label={t('Condition')} width="sm:w-96" className="max-h-[70dvh] overflow-y-auto p-3">
        <ConditionFields value={condition ?? {}} onChange={(c) => onCondition(Object.keys(c).length ? c : null)} names={names} />
        <div className="mt-2 flex justify-end"><Button size="sm" variant="primary" onClick={() => setOpen('')}>{t('Done')}</Button></div>
      </Popover>
    </section>
  )
}

/** The list of cards with its "+ Add step" at the end. */
export function CardColumn({ steps, state, events, onAdd, children }: { steps: RoutineStep[]; state: CardState; events: CardEvents; onAdd: () => void; children?: ReactNode }) {
  return (
    <div className="space-y-2" data-card-column>
      {children}
      {steps.map((s, i) => <StepCard key={s.id} step={s} index={i} total={steps.length} state={state} events={events} />)}
      <Button variant="secondary" icon="plus" onClick={onAdd} data-add-step>{t('Add step')}</Button>
    </div>
  )
}
