// New habit, Make it a habit and Edit (OpenSpec changes habits-home D9 and
// habits-polish D4): one small form with the title, how often, the tiny version, the
// anchor, the part of the day and the colour, written as one batch with one Undo. A
// completion-relative rule is refused until a calendar rule is chosen; nothing is
// written before. No other task field.
import { useState, type FormEvent } from 'react'
import { createHabit, habitRuleProblem, makeHabit, proposedRule, type HabitInput } from '../../lib/habitActions'
import { t } from '../../lib/i18n'
import { useTask } from '../../lib/localData'
import type { Task } from '../../lib/types'
import { Button, Dialog, Field, HUES, hueFor, Input, SegmentedControl } from '../../ui'
import { hueName } from '../../lib/colourNames'
import { act } from '../actionError'
import { showUndoToast } from '../bulk/toastStore'
import { closeHabitForm, useHabitForm, type HabitFormRequest } from './habitFormStore'
import { DAY_LABEL, DAYS, oftenOf, partOf, type Often, type Part } from './habitRule'

export function HabitFormDialog({ req, task }: { req: HabitFormRequest; task: Task | null }) {
  const start = proposedRule(task)
  const first = oftenOf(start)
  const [title, setTitle] = useState(task?.title ?? req.title ?? '')
  const [often, setOften] = useState<Often>(first.often)
  const [days, setDays] = useState<string[]>(first.days.length ? first.days : ['mon', 'wed', 'fri'])
  const [other, setOther] = useState(first.often === 'other' ? start : '')
  const [tiny, setTiny] = useState(task?.habit_tiny ?? '')
  const [anchor, setAnchor] = useState(task?.habit_anchor ?? '')
  const [part, setPart] = useState<Part>(partOf(task))
  const [color, setColor] = useState(task?.habit_color ?? '')
  // A completion-relative rule asks for a calendar one at once (D9).
  const [tried, setTried] = useState(habitRuleProblem(start) === 'after-completion')
  const rule = often === 'daily' ? 'every day' : often === 'days' ? `every ${DAYS.filter((d) => days.includes(d)).join(', ')}` : other
  const problem = often === 'days' && days.length === 0 ? 'invalid' : habitRuleProblem(rule)
  const ruleError = !tried || !problem ? undefined
    : problem === 'after-completion' ? t('A habit repeats on the calendar. Choose a rule such as every day.') : t('Type a rule such as every weekday.')
  const making = !!req.taskId
  const editing = making && !!task?.habit

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!title.trim() || problem) return
    const input: HabitInput = { title, rule, tiny, anchor, part: part === 'any' ? null : part, color }
    act((async () => {
      const r = making && task ? await makeHabit(task.id, input) : await createHabit(input)
      if (r?.entry) showUndoToast(r.label, r.entry.id)
      closeHabitForm()
    })())
  }

  return (
    <Dialog title={editing ? t('Edit habit') : making ? t('Make it a habit') : t('New habit')} onClose={closeHabitForm} testId="habit-form">
      <form className="space-y-4" onSubmit={submit} data-habit-form>
        <Field label={t('Title')}><Input autoFocus value={title} maxLength={500} onChange={(e) => setTitle(e.target.value)} data-habit-title /></Field>
        <Field label={t('How often')} error={ruleError}>
          <div className="space-y-2">
            <SegmentedControl label={t('How often')} value={often} onChange={setOften} data-habit-often
              options={[{ id: 'daily', label: t('Every day') }, { id: 'days', label: t('Days of the week') }, { id: 'other', label: t('Other') }]} />
            {often === 'days' && (
              <div className="flex flex-wrap gap-1" role="group" aria-label={t('Days of the week')}>
                {DAYS.map((d) => (
                  <button key={d} type="button" aria-pressed={days.includes(d)} data-habit-day={d}
                    onClick={() => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))}
                    className={`ui-btn ui-btn--sm min-w-11 ${days.includes(d) ? 'ui-btn--primary' : 'ui-btn--secondary'}`}>{DAY_LABEL[d]()}</button>
                ))}
              </div>
            )}
            {often === 'other' && <Input value={other} onChange={(e) => setOther(e.target.value)} placeholder="every weekday" aria-label={t('Repeat rule')} data-habit-rule />}
          </div>
        </Field>
        <Field label={t('Tiny version')} hint={t('The two-minute version that still counts on a bad day')}><Input value={tiny} maxLength={200} onChange={(e) => setTiny(e.target.value)} placeholder={t('One page')} data-habit-tiny /></Field>
        <Field label={t('After')} hint={t('The routine this habit follows, like "After dinner"')}><Input value={anchor} maxLength={200} onChange={(e) => setAnchor(e.target.value)} placeholder={t('After dinner')} data-habit-anchor /></Field>
        <Field label={t('Part of the day')}>
          <SegmentedControl label={t('Part of the day')} value={part} onChange={setPart} wrap data-habit-part
            options={[{ id: 'any', label: t('Any time') }, { id: 'morning', label: t('Morning') }, { id: 'afternoon', label: t('Afternoon') }, { id: 'evening', label: t('Evening') }]} />
        </Field>
        <HabitColours value={color} onPick={setColor} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={closeHabitForm}>{t('Cancel')}</Button>
          <Button type="submit" variant="primary" size="sm" disabled={!title.trim()} data-habit-save>{editing ? t('Save') : making ? t('Make it a habit') : t('Create habit')}</Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Automatic and the 12 palette colours as one radio group (habits-polish D5). */
function HabitColours({ value, onPick }: { value: string; onPick: (hex: string) => void }) {
  const current = value ? hueFor(value) : null
  const ring = 'ring-2 ring-accent ring-offset-2 ring-offset-surface'
  return (
    <div className="space-y-1.5">
      <p className="text-body font-medium text-default" id="habit-colour-label">{t('Colour')}</p>
      <div role="radiogroup" aria-labelledby="habit-colour-label" className="flex flex-wrap gap-1" data-habit-colours>
        <button type="button" role="radio" aria-checked={current === null} aria-label={t('Automatic')} data-habit-colour=""
          className="touch-target inline-flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus" onClick={() => onPick('')}>
          <span className={`block h-5 w-5 rounded-full border border-dashed border-strong ${current === null ? ring : ''}`} />
        </button>
        {HUES.map((h) => (
          <button key={h.name} type="button" role="radio" aria-checked={h.name === current} aria-label={hueName(h.name)} data-habit-colour={h.hex}
            className="touch-target inline-flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus" onClick={() => onPick(h.hex)}>
            <span data-hue={h.name} className={`block h-5 w-5 rounded-full bg-hue-solid ${h.name === current ? ring : ''}`} />
          </button>
        ))}
      </div>
    </div>
  )
}

/** The open form, if any: mounted by the shell, loaded on first use. */
export default function HabitFormHost() {
  const req = useHabitForm()
  const task = useTask(req?.taskId ?? null)
  if (!req || (req.taskId && task === undefined)) return null
  return <HabitFormDialog key={req.taskId ?? req.title ?? ''} req={req} task={task ?? null} />
}
