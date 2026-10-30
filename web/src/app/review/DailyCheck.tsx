// The Daily check (OpenSpec change open-loops-method, design D5; weekly-review
// "Daily check"): on one page the Inbox count, what is open from earlier and today's tasks,
// where `f` puts up to three of them in today's focus. "Done for today" records
// the check on the synced personal `review` row. Yesterday's line for tomorrow
// (close-the-day D7) is shown first, read-only, until the day is closed again.
// In Bento style (bento-daily-check D5) the focus is a Large, a Medium and a Small
// slot, and `f` places a task by its estimate or opens the slot menu.
import { useEffect, useMemo, useState } from 'react'
import { bentoList, readBento, readBentoOrder, readFocusStyle, setBentoOrder, setFocusStyle, type BentoRead, type BentoSlot } from '../../lib/bento'
import { bentoPress, freeSlots, SLOT_NAMES, takenMessage, withPlaced, withRemoved, writeBento } from '../../lib/bentoSlots'
import { todayList } from '../../lib/dayLists'
import { formatInstant } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { resolveLabels } from '../../lib/labels'
import { hasTimeColumn } from '../../lib/rowTime'
import { useAllLabels, useReviewRow, useUserPrefsRow } from '../../lib/localData'
import { setTaskCompleted, updateTask } from '../../lib/ops'
import { dailyDue, finishDailyCheck, FOCUS_MAX, focusTasks, toggleFocus, yesterdaysNote } from '../../lib/review'
import { canEditTask } from '../../lib/sharing'
import { qualifies } from '../../lib/triage'
import type { Membership, Task } from '../../lib/types'
import { overdueInToday } from '../../lib/views'
import { Button, Dialog, MenuGroup, MenuItem, Notice, PageBody, PageHeader, Skeleton } from '../../ui'
import { act } from '../actionError'
import { showUndoToast } from '../bulk/toastStore'
import { BriefingText, useBriefing } from '../Briefing'
import { useWithMethod } from '../help/MethodLink'
import { LabelPicker } from '../LabelPicker'
import { useMethodInput } from '../method/useMethodInput'
import { setPanelTaskId, usePanelTaskId } from '../panel'
import { navigate } from '../router'
import { useShortcutScope } from '../shortcuts'
import { TaskRow } from '../TaskRow'
import { useListKeys } from '../useListKeys'
import { BentoSlotRows, SlotChooser } from './BentoSlots'

export function DailyCheck() {
  const input = useMethodInput()
  const labels = useAllLabels()
  const review = useReviewRow()
  const prefs = useUserPrefsRow()
  const bentoOn = readFocusStyle(prefs) === 'bento'
  const order = readBentoOrder(prefs)
  // Today's briefing opens the check (OpenSpec change briefing; weekly-review "Daily check").
  const briefing = useBriefing('today')
  const [message, setMessage] = useState<{ text: string; choose?: Task } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [chooseFor, setChooseFor] = useState<Task | null>(null)
  const openId = usePanelTaskId()
  const groups = useMemo(() => {
    if (!input) return null
    const archived = new Set(input.projects.filter((p) => p.archived || p.deleted_at).map((p) => p.id))
    const live = input.tasks.filter((x) => !x.deleted_at && !(x.project_id && archived.has(x.project_id)))
    const today = todayList(live, input.today)
    // Completed or deleted tasks leave the Bento as they leave the focus: without a write.
    const bento = readBento(review, input.today, live.filter((x) => !x.completed_at))
    return {
      inbox: live.filter(qualifies).length,
      focus: bentoOn ? bentoList(bento, order) : focusTasks(review, input.today, live),
      bento,
      overdue: today.filter((x) => overdueInToday(x, input.today)),
      today: today.filter((x) => !overdueInToday(x, input.today)),
    }
  }, [input, review, bentoOn, order])
  const sections: { key: string; heading: string; tasks: Task[] }[] = groups ? [
    { key: 'focus', heading: t('Today’s focus'), tasks: groups.focus },
    { key: 'earlier', heading: t('Earlier'), tasks: groups.overdue },
    { key: 'today', heading: t('Today'), tasks: groups.today },
  ] : []
  const rows = sections.flatMap((s) => s.tasks.map((task) => ({ key: `${s.key}:${task.id}`, task })))
  // The time column (rows-v2 D2): one fact of the whole check.
  const timeColumn = hasTimeColumn(rows.map((r) => r.task))
  useListKeys({ rows, selected, setSelected, openId, setOpenId: setPanelTaskId, pickerFor, setPickerFor, onIdleEscape: () => setSelected(null) })
  useEffect(() => { if (selected && !rows.some((r) => r.key === selected)) setSelected(null) }, [rows, selected])
  const focusIds = new Set(groups?.focus.map((x) => x.id) ?? [])
  const editable = (task: Task) => !!input && canEditTask(task, input.memberships as Map<string, Membership>)

  /** Writes a Bento change as one batch with Undo (D5). */
  const writeSlots = async (next: BentoRead, text: string) => {
    if (!input) return
    const entry = await writeBento(review, next, order, input.today, text)
    if (entry) showUndoToast(text, entry.id)
    setMessage({ text })
  }
  const place = (read: BentoRead, task: Task, slot: BentoSlot) => {
    const next = withPlaced(read, task, slot)
    if (!next) { setMessage({ text: takenMessage(slot, read.slots[slot]!), choose: task }); return Promise.resolve() }
    return writeSlots(next, t('{title} is in the {slot} slot.', { title: task.title, slot: SLOT_NAMES[slot] }))
  }
  const pressBento = async (task: Task) => {
    if (!groups) return
    const read = groups.bento
    const press = bentoPress(read, task)
    switch (press.kind) {
      case 'remove': return writeSlots(withRemoved(read, task.id), t('{title} left today’s focus.', { title: task.title }))
      case 'place': return place(read, task, press.slot)
      case 'taken': setMessage({ text: takenMessage(press.slot, press.occupant), choose: task }); return
      case 'choose': setChooseFor(task); return
      case 'full': setMessage({ text: t('Every slot is full. Take one out first.') })
    }
  }
  const toggle = async (task: Task) => {
    if (!input) return
    if (bentoOn) return pressBento(task)
    const outcome = await toggleFocus(review, input.today, input.tasks, task.id)
    setMessage({ text: outcome === 'full' ? t('Today’s focus holds {n} tasks. Take one out first.', { n: FOCUS_MAX })
      : outcome === 'added' ? t('{title} is in today’s focus.', { title: task.title }) : t('{title} left today’s focus.', { title: task.title }) })
  }
  /** Set estimate… then place by the new estimate (D5); a taken slot gets the message. */
  const estimateThenPlace = async (task: Task, minutes: number) => {
    setChooseFor(null)
    await updateTask(task.id, { estimate_minutes: minutes })
    if (!groups) return
    const sized = { ...task, estimate_minutes: minutes }
    const press = bentoPress(groups.bento, sized)
    if (press.kind === 'place') return place(groups.bento, sized, press.slot)
    if (press.kind === 'taken') setMessage({ text: takenMessage(press.slot, press.occupant), choose: sized })
    else if (press.kind === 'full') setMessage({ text: t('Every slot is full. Take one out first.') })
  }
  useShortcutScope('view', {
    'review.focus': () => {
      const task = rows.find((r) => r.key === selected)?.task
      if (!task || openId || chooseFor) return false
      act(toggle(task))
    },
  }, { view: 'review' })

  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const projectMap = useMemo(() => new Map((input?.projects ?? []).map((p) => [p.id, p])), [input])
  const done = !!input && !dailyDue(review?.daily_at, input.today)
  const note = input ? yesterdaysNote(review, input.today) : null
  const meta = useWithMethod('review', done ? t('Done today, {instant}', { instant: formatInstant(review!.daily_at, 'time') }) : undefined)
  const subtitle = useWithMethod('review')
  const renderRow = (sectionKey: string, task: Task, crumb: string | null) => {
    const key = `${sectionKey}:${task.id}`
    return (
      <TaskRow key={key} task={task} project={task.project_id ? projectMap.get(task.project_id) : undefined} labels={resolveLabels(task.labels, labelMap)}
        showProject selected={key === selected} timeColumn={timeColumn} breadcrumb={crumb}
        onToggle={() => act(setTaskCompleted(task.id, !task.completed_at))}
        onOpen={() => { setSelected(key); setPanelTaskId(task.id) }} />
    )
  }
  // The header menu (D4): the focus style, and the order while Bento is chosen.
  const overflow = (
    <>
      <MenuGroup label={t('Daily focus')}>
        <MenuItem label={t('Three tasks')} checked={!bentoOn} data-focus-style="three" onSelect={() => act(setFocusStyle('three'))} />
        <MenuItem label={t('Bento')} description={t('A Large, a Medium and a Small task')} checked={bentoOn} data-focus-style="bento" onSelect={() => act(setFocusStyle('bento'))} />
      </MenuGroup>
      {bentoOn && (
        <MenuGroup label={t('Order')}>
          <MenuItem label={t('Frog: Large first')} checked={order === 'frog'} data-bento-order="frog" onSelect={() => act(setBentoOrder('frog'))} />
          <MenuItem label={t('Summit: Medium first')} checked={order === 'summit'} data-bento-order="summit" onSelect={() => act(setBentoOrder('summit'))} />
        </MenuGroup>
      )}
    </>
  )

  return (
    <PageBody width="list">
      <PageHeader title={t('Daily check', { context: 'method' })} icon="sun" meta={meta} subtitle={subtitle} help="review/daily" overflow={overflow}
        back={{ label: t('Weekly review'), onClick: () => navigate({ view: 'review' }), hideFrom: 'lg' }}
        actions={<Button size="sm" variant={done ? 'secondary' : 'primary'} onClick={() => act(finishDailyCheck().then(() => setMessage({ text: t('Daily check done. See you tomorrow.') })))}>{t('Done for today')}</Button>} />
      {!groups ? <Skeleton shape="row" count={4} /> : (
        <>
          {briefing && <p className="mb-4 max-w-[72ch] text-prose text-muted" data-page-briefing><BriefingText briefing={briefing} /></p>}
          {note && (
            <div className="mb-4" data-daily-note>
              <Notice tone="info">
                <span className="block text-hint font-semibold uppercase tracking-wide">{t('Yesterday’s line')}</span>
                <span className="user-text">{note}</span>
              </Notice>
            </div>
          )}
          {message && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p role="status" className="text-meta text-muted" data-daily-message>{message.text}</p>
              {message.choose && <Button size="sm" variant="secondary" data-bento-choose onClick={() => { setChooseFor(message.choose!); setMessage(null) }}>{t('Choose a slot')}</Button>}
            </div>
          )}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2" data-daily-inbox>
            <p className="text-body text-muted">{groups.inbox ? t('{count} to process in the Inbox.', { count: groups.inbox }) : t('The Inbox is empty.')}</p>
            {groups.inbox > 0 && <Button size="sm" onClick={() => navigate({ view: 'triage' })}>{t('Process the Inbox')}</Button>}
          </div>
          <p className="mb-3 text-meta text-faint">{bentoOn
            ? t('Select a task and press f to put it in a slot by its estimate. c completes, Enter opens.')
            : t('Select a task and press f to put it in today’s focus, up to three. c completes, Enter opens.')}</p>
          {bentoOn && (
            <section data-group="focus" data-bento className="mb-4" aria-labelledby="daily-focus">
              <h2 id="daily-focus" className="mb-1 px-2 text-meta font-semibold text-faint">{t('Today’s focus')}</h2>
              <BentoSlotRows read={groups.bento} order={order} row={(task, slot) => renderRow('focus', task, slot ? SLOT_NAMES[slot] : t('Not sized'))} />
            </section>
          )}
          {groups.overdue.length === 0 && groups.today.length === 0 && <Notice tone="info">{t('Nothing is due today. Pick your focus from Next.')}</Notice>}
          {sections.filter((s) => s.tasks.length > 0 && !(bentoOn && s.key === 'focus')).map((s) => (
            <section key={s.key} data-group={s.key} className="mb-4" aria-labelledby={`daily-${s.key}`}>
              <h2 id={`daily-${s.key}`} className="mb-1 px-2 text-meta font-semibold text-faint">{s.heading}</h2>
              <ul>
                {s.tasks.map((task) => renderRow(s.key, task, s.key !== 'focus' && focusIds.has(task.id) ? t('In today’s focus') : null))}
              </ul>
            </section>
          ))}
        </>
      )}
      {chooseFor && groups && (
        <SlotChooser task={chooseFor} free={freeSlots(withRemoved(groups.bento, chooseFor.id))} editable={editable(chooseFor)}
          onPick={(slot) => { const task = chooseFor; setChooseFor(null); act(place(groups.bento, task, slot)) }}
          onEstimate={(minutes) => act(estimateThenPlace(chooseFor, minutes))}
          onClose={() => setChooseFor(null)} />
      )}
      {pickerFor && (
        <Dialog title={t('Labels')} label={t('Labels for task')} onClose={() => setPickerFor(null)}>
          <LabelPicker taskId={pickerFor} onClose={() => setPickerFor(null)} />
        </Dialog>
      )}
    </PageBody>
  )
}
