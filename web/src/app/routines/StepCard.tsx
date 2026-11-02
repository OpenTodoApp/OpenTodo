// A routine's sentence cards (OpenSpec change routines-editor, design D2, D4,
// D5, D7 and D13): the When card, and one card per step read as a sentence whose
// inputs are word buttons, with its output line, its live preview, its error and
// one-tap fix, "Not available" with a link, a menu (move, duplicate, delete, add
// an input), and If / Repeat blocks indented under it.
import { Fragment, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { t } from '../../lib/i18n'
import type { Catalogue } from '../../lib/rules/catalogue'
import { isAvailable, reasonText, settingPath } from '../../lib/rules/catalogue'
import { pickModeOf, pickUnsorted, PICK_MODES, setPickMode, sortBeforePick, type PickMode, type RoutineDraft } from '../../lib/rules/draft'
import type { Fix } from '../../lib/rules/fixes'
import { roundEstimate } from '../../lib/rules/ai'
import { previewLines, type Preview } from '../../lib/rules/preview'
import { addableInputs, countText, extraInputs, inputLabel, PICK_MENU, PICK_WORD, sentenceParts, stepName } from '../../lib/rules/sentence'
import { conditionParts, triggerText } from '../../lib/rules/summary'
import { stepKind } from '../../lib/rules/steps'
import { RULE_TRIGGERS, type RoutineArg, type RoutineStep, type RuleCondition, type RuleTrigger, type RuleTriggerKind } from '../../lib/types'
import { Badge, Button, DataChip, Icon, WordButton } from '../../ui'
import { ActionMenu, type ActionGroup } from '../menus/ActionMenu'
import { ConditionFields, TRIGGER_LABEL, TriggerDetails, triggerHasDetails, triggerOf } from '../rules/RuleFields'
import { useMatchCount } from './data'
import { inputDefs, wordValue, type WordContext } from './words'
import { InputWord } from './wordPicker'
import { ChoicePopover, Inspector, type Choice } from './pickers'

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

/** A place in a list of steps: under a parent's block ('' for the top), before `index` (-1 for the end). */
export interface ListPlace { parent: string; block: string; index: number }

export interface CardState {
  ctx: WordContext
  catalogue: Catalogue | null
  previews: Map<string, Preview>
  online: boolean
  error: { step: string; input: string; text: string; fix: Fix | null } | null
  me: string
  /** The editor registers each word's opener for "Choose another value". */
  openers: Map<string, () => void>
  /** Focus left a step's card: its "needs a value here" error may show from now on. */
  leave: (stepId: string) => void
  /** Where the step catalogue is open, if anywhere (routines-editor-no-modals). */
  adding: ListPlace | null
  /** The open step catalogue, rendered at that place. */
  addPanel: ReactNode
}

/** The id of the open step catalogue, for its opener's aria-controls. */
export const ADD_PANEL_ID = 'routine-add-step'

const isAddingAt = (state: CardState, parent: string, block: string, index: number) =>
  !!state.adding && state.adding.parent === parent && state.adding.block === block && state.adding.index === index

/** A list's cards, with the step catalogue between two of them when "Add step below" opened it there. */
function Cards({ steps, parent, block, state, events, depth }: { steps: RoutineStep[]; parent: string; block: string; state: CardState; events: CardEvents; depth: number }) {
  return (
    <>
      {steps.map((s, i) => (
        <Fragment key={s.id}>
          <StepCard step={s} index={i} total={steps.length} state={state} events={events} depth={depth} />
          {isAddingAt(state, parent, block, i + 1) && state.addPanel}
        </Fragment>
      ))}
    </>
  )
}

/** "+ Add step" at the end of a list: the catalogue expands right under it. */
function AddButton({ parent, block, state, onClick, top }: { parent: string; block: string; state: CardState; onClick: () => void; top?: boolean }) {
  const open = isAddingAt(state, parent, block, -1)
  return (
    <>
      <Button size={top ? 'md' : 'sm'} variant={top ? 'secondary' : 'ghost'} icon="plus" onClick={onClick} aria-expanded={open} aria-controls={open ? ADD_PANEL_ID : undefined}
        data-add-step={top ? '' : undefined} data-add-in={top ? undefined : `${parent}.${block}`}>{t('Add step')}</Button>
      {open && state.addPanel}
    </>
  )
}

/** The plain sentence of a step, for its group's name and its announcement. */
export function sentenceText(step: RoutineStep, ctx: WordContext): string {
  const k = stepKind(step.kind)
  return sentenceParts(step).map((p) => {
    if ('text' in p) return p.text
    if (isPick(step.kind) && p.slot === 'from') return t(PICK_WORD[pickModeOf(step)])
    if (isPick(step.kind) && p.slot === 'n' && !['first_n', 'last_n'].includes(pickModeOf(step))) return ''
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

const isPick = (kind: string) => kind === 'take' || kind === 'filter'

/** Pick's mode word and its menu (routines-dynamic-data D2): switching keeps the step's id, so later steps keep reading it. */
function PickModeWord({ step, events }: { step: RoutineStep; events: CardEvents }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const mode = pickModeOf(step)
  const choose = (m: PickMode) => {
    setOpen(false)
    if (m !== mode) events.edit((d) => setPickMode(d, step.id, m))
  }
  // The same anchored list as every other word: a row with a check marks the mode (routines-editor-polish).
  const choices: Choice[] = PICK_MODES.map((m) => ({ key: m, label: t(PICK_MENU[m]), selected: m === mode, run: () => choose(m) }))
  return (
    <>
      <WordButton ref={anchor} label={t('Which')} value={t(PICK_WORD[mode])} placeholder="" action={t('change')} haspopup="listbox" expanded={open} onClick={() => setOpen(true)} />
      <ChoicePopover open={open} onClose={() => { setOpen(false); requestAnimationFrame(() => anchor.current?.focus()) }} anchor={anchor} label={t('Which')} choices={choices} />
    </>
  )
}

/** "In list order · Sort first" under a Pick card that reads its tasks without a Sort step (D2). */
function PickOrder({ step, state, events }: { step: RoutineStep; state: CardState; events: CardEvents }) {
  const mode = pickModeOf(step)
  const list = step.in?.list
  const type = list && 'ref' in list ? (list.ref === 'trigger' || list.ref === 'item' ? undefined : state.ctx.types[list.ref]) : undefined
  if (mode === 'all' || mode === 'where' || type !== 'tasks' || !pickUnsorted(state.ctx.draft, step.id)) return null
  return (
    <p className="flex flex-wrap items-center gap-2 text-meta text-muted" data-pick-order>
      <span>{t('In list order')}</span>
      <Button size="sm" variant="ghost" icon="list-ordered" onClick={() => events.edit((d) => sortBeforePick(d, step.id))}>{t('Sort first')}</Button>
    </p>
  )
}

/** The words of a step: the sentence with its slots, then its extra set inputs. */
function StepWords({ step, state, events, adding, errorAt, onTyping }: {
  step: RoutineStep; state: CardState; events: CardEvents; adding: readonly string[]
  /** The input whose error shows (outlined), if any. */
  errorAt: string | null
  onTyping: (input: string, typing: boolean) => void
}) {
  const k = stepKind(step.kind)
  const word = (name: string) => {
    if (isPick(step.kind) && name === 'from') return <PickModeWord key={name} step={step} events={events} />
    if (isPick(step.kind) && name === 'n' && !['first_n', 'last_n'].includes(pickModeOf(step))) return null
    const def = k?.inputs.find((d) => d.name === name)
    if (!def) return null
    return (
      <InputWord key={name} step={step} def={def} ctx={state.ctx} me={state.me} error={errorAt === name}
        onSet={(a) => events.set(step.id, name, a)} onEdit={events.edit} openRef={(open) => state.openers.set(`${step.id}.${name}`, open)}
        onTyping={(on) => onTyping(name, on)} />
    )
  }
  return (
    <>
      {sentenceParts(step).map((p, i) => ('text' in p ? <span key={i} data-punct={/^[:,.;)]/.test(p.text) || undefined}>{p.text}</span> : word(p.slot)))}
      {inputDefs(step, [...extraInputs(step), ...adding.filter((n) => !(step.in && n in step.in))]).map((d) => (
        <span key={d.name} className="text-muted"> · {inputLabel(d.name, step.kind)}{word(d.name)}</span>
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
      <Cards steps={steps} parent={parent} block={block} state={state} events={events} depth={depth + 1} />
      <AddButton parent={parent} block={block} state={state} onClick={() => events.addIn(parent, block)} />
    </div>
  )
}

/** Keys of a focused card (D13): Alt+↑/↓ move it, Delete deletes it (with Undo), `a` adds a step below. */
function cardKeys(e: KeyboardEvent<HTMLElement>, step: RoutineStep, events: CardEvents) {
  if (e.target !== e.currentTarget) return
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault()
    events.move(step.id, e.key === 'ArrowUp' ? -1 : 1)
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    events.remove(step.id)
  } else if (e.key === 'a' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault()
    events.addBelow(step.id)
  }
}

export function StepCard({ step, index, total, state, events, depth = 0 }: {
  step: RoutineStep; index: number; total: number; state: CardState; events: CardEvents; depth?: number
}) {
  const [adding, setAdding] = useState<string[]>([])
  const k = stepKind(step.kind)
  const cat = state.catalogue?.[step.kind]
  const available = isAvailable(state.catalogue, step.kind)
  const [typing, setTyping] = useState<string | null>(null)
  const sentence = sentenceText(step, state.ctx)
  // The error of an input whose text is being typed waits until the text is kept (routines-editor-polish).
  const err = state.error?.step === step.id && state.error.input !== typing ? state.error : null
  const onTyping = (input: string, on: boolean) => setTyping((cur) => (on ? input : cur === input ? null : cur))
  // Leaving the card (not for one of its own pickers) lets its "needs a value" error show.
  const onLeave = (e: FocusEvent<HTMLElement>) => {
    const to = e.relatedTarget as HTMLElement | null
    if (to && (e.currentTarget.contains(to) || to.closest('[data-overlay-root]'))) return
    state.leave(step.id)
  }
  const groups: ActionGroup[] = [
    { items: [
      { kind: 'action', id: 'up', label: t('Move up'), icon: 'arrow-up', disabled: index === 0, onSelect: () => events.move(step.id, -1) },
      { kind: 'action', id: 'down', label: t('Move down'), icon: 'arrow-down', disabled: index === total - 1, onSelect: () => events.move(step.id, 1) },
      { kind: 'action', id: 'below', label: t('Add step below'), icon: 'plus', onSelect: () => events.addBelow(step.id) },
      { kind: 'action', id: 'duplicate', label: t('Duplicate'), icon: 'copy', onSelect: () => events.duplicate(step.id) },
    ] },
    ...(addableInputs(step).length ? [{ items: addableInputs(step).map((name) => ({
      kind: 'action' as const, id: `add-${name}`, label: t('Add {input}', { input: inputLabel(name, step.kind).toLocaleLowerCase() }), icon: 'plus' as const,
      onSelect: () => {
        const arg = defaultArg(step, name)
        if (arg) events.set(step.id, name, arg)
        else setAdding((xs) => [...xs, name])
        setTimeout(() => state.openers.get(`${step.id}.${name}`)?.(), 0)
      },
    })) }] : []),
    { items: [{ kind: 'action', id: 'delete', label: t('Delete step'), icon: 'trash-2', tone: 'danger', onSelect: () => events.remove(step.id) }] },
  ]
  return (
    <section className={`surface-card space-y-1 p-3 outline-none focus-visible:ring-2 focus-visible:ring-accent ${err ? 'border-danger' : ''}`} tabIndex={0}
      role="group" aria-label={sentence} data-step-card={step.id} data-step-kind={step.kind} data-word-group
      onKeyDown={(e) => cardKeys(e, step, events)} onBlur={onLeave}>
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 leading-8 text-body text-default">
          <StepWords step={step} state={state} events={events} adding={adding} errorAt={err?.input ?? null} onTyping={onTyping} />
        </p>
        <ActionMenu label={t('Menu for step {name}', { name: stepName(step.kind) })} groups={groups} />
      </div>
      {/* A word's bigger editor opens here from 1024 px (routines-dynamic-data D13). */}
      <div data-card-inspector={step.id} />
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
      {isPick(step.kind) && <PickOrder step={step} state={state} events={events} />}
      <OutputLine step={step} state={state} />
      <PreviewBlock p={state.previews.get(step.id)} ctx={state.ctx} online={state.online} />
      {k?.blocks?.includes('then') && <Lane title={t('Then')} steps={step.then ?? []} parent={step.id} block="then" state={state} events={events} depth={depth} />}
      {k?.blocks?.includes('otherwise') && <Lane title={t('Otherwise')} steps={step.otherwise ?? []} parent={step.id} block="otherwise" state={state} events={events} depth={depth} />}
      {k?.blocks?.includes('do') && <Lane title={t('For each item')} steps={step.do ?? []} parent={step.id} block="do" state={state} events={events} depth={depth} />}
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

/** The When card: the trigger and its conditions as words (D2), edited with the rule dialog's controls. */
export function WhenCard({ trigger, condition, ctx, me, onTrigger, onCondition }: {
  trigger: RuleTrigger; condition: RuleCondition | null; ctx: WordContext; me: string
  onTrigger: (t: RuleTrigger) => void; onCondition: (c: RuleCondition | null) => void
}) {
  // The trigger's kinds open as the word pickers' anchored list, at the word's start edge; a
  // kind's details (a time and days, a label, a project) and the condition rows open inside
  // the card, never as a dialog (routines-editor-no-modals).
  const [open, setOpen] = useState<'' | 'trigger' | 'details' | 'condition'>('')
  const toDetails = useRef(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const condRef = useRef<HTMLButtonElement>(null)
  const names = ctx.names
  const phrase = triggerText(trigger, names)
  const cond = conditionParts(condition, names).join(', ')
  const count = useMatchCount(condition, me)
  const shared = new Set<string>()
  const back = (to: RefObject<HTMLButtonElement | null>) => { setOpen(''); requestAnimationFrame(() => to.current?.focus()) }
  const choose = (kind: RuleTriggerKind) => {
    if (kind !== trigger.kind) onTrigger(triggerOf(kind))
    toDetails.current = triggerHasDetails(kind)
  }
  const choices: Choice[] = RULE_TRIGGERS.map((k) => ({
    key: k, label: TRIGGER_LABEL[k], selected: k === trigger.kind, run: () => choose(k),
    secondary: k === trigger.kind && triggerHasDetails(k) ? t('Change the details') : undefined,
  }))
  // A pick closes the list once (the list and its combobox may both report it).
  const listOpen = useRef(false)
  const openList = () => { listOpen.current = true; setOpen('trigger') }
  const closeList = () => {
    if (!listOpen.current) return
    listOpen.current = false
    if (toDetails.current) { toDetails.current = false; setOpen('details'); return }
    back(triggerRef)
  }
  return (
    <section className="surface-card space-y-1 p-3" role="group" aria-label={`${phrase}${cond ? ` · ${cond}` : ''}`} data-when-card data-word-group>
      <p className="leading-8 text-body text-default">
        <WordButton ref={triggerRef} label={t('When')} value={phrase.charAt(0).toLocaleUpperCase() + phrase.slice(1)} placeholder={t('choose when')} action={t('change')}
          haspopup="listbox" expanded={open === 'trigger'} onClick={openList} />
        {trigger.kind !== 'manual' && (
          <>
            <span> {t('if')} </span>
            <WordButton ref={condRef} label={t('Condition')} value={cond} placeholder={t('any task')} action={t('change')}
              haspopup="dialog" expanded={open === 'condition'} onClick={() => setOpen('condition')} />
          </>
        )}
      </p>
      {trigger.kind !== 'manual' && (
        <p className="text-meta text-muted" data-rule-count>{t('{n, plural, one {# open task matches now} other {# open tasks match now}}', { n: count })}</p>
      )}
      <ChoicePopover open={open === 'trigger'} onClose={closeList} anchor={triggerRef} label={t('When')} choices={choices} />
      {open === 'details' && triggerHasDetails(trigger.kind) && (
        <TriggerDetailsPanel trigger={trigger} names={names} shared={shared} onTrigger={onTrigger} onDone={() => back(triggerRef)} />
      )}
      {/* The condition rows: inside this card from 1024 px, a bottom sheet below, as on a step's card. */}
      <div data-card-inspector="when" />
      <Inspector open={open === 'condition'} onClose={() => back(condRef)} stepId="when" title={t('Condition')}>
        <ConditionFields value={condition ?? {}} onChange={(c) => onCondition(Object.keys(c).length ? c : null)} names={names} />
      </Inspector>
    </section>
  )
}

/** A trigger's details inside the When card: focus moves to its first control, Escape and Done put it back on the word. */
function TriggerDetailsPanel({ trigger, names, shared, onTrigger, onDone }: {
  trigger: RuleTrigger; names: WordContext['names']; shared: Set<string>; onTrigger: (t: RuleTrigger) => void; onDone: () => void
}) {
  const panel = useRef<HTMLElement>(null)
  useLayoutEffect(() => { panel.current?.querySelector<HTMLElement>('input, select, button')?.focus() }, [])
  return (
    <section ref={panel} className="mt-2 space-y-2 rounded-control border border-default bg-sunken p-3" aria-label={t('{when}: details', { when: TRIGGER_LABEL[trigger.kind] })}
      data-trigger-details data-overlay="inline" onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onDone() } }}>
      <TriggerDetails value={trigger} onChange={onTrigger} names={names} sharedProjects={shared} />
      <div className="flex justify-end"><Button size="sm" variant="primary" onClick={onDone}>{t('Done')}</Button></div>
    </section>
  )
}

/** The list of cards with its "+ Add step" at the end. */
export function CardColumn({ steps, state, events, onAdd, children }: { steps: RoutineStep[]; state: CardState; events: CardEvents; onAdd: () => void; children?: ReactNode }) {
  return (
    <div className="space-y-2" data-card-column>
      {children}
      <Cards steps={steps} parent="" block="" state={state} events={events} depth={0} />
      <AddButton parent="" block="" state={state} onClick={onAdd} top />
    </div>
  )
}
