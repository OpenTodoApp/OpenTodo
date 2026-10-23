// The briefing sentence of the day pages (OpenSpec change `briefing`): the facts of
// lib/briefing worded through the message layer. A bold lead sentence, then what
// stands out joined by the language's own list pattern; late in the danger tone, a
// full day in the warning tone, a reply in the strong text tone (design D2, D5).
import { Fragment, useMemo, type ReactNode } from 'react'
import { briefingFacts, type Briefing, type BriefingFact, type BriefingTask, type BriefingTomorrow } from '../lib/briefing'
import { formatTime, weekday } from '../lib/dates'
import { formatMinutes } from '../lib/duration'
import { formatList, t, useLanguageVersion } from '../lib/i18n'
import { useGridPrefs, useLiveProjects } from '../lib/liveData'
import { useNotifications, useReviewRow } from '../lib/localData'
import { useLiveTasks } from '../lib/liveTasks'
import { dayClosed } from '../lib/review'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { useToday } from './useViews'

/** The briefing of Today or Upcoming from the live rows; null for any other view and until the tasks are read. */
export function useBriefing(view: 'today' | 'upcoming' | null): Briefing | null {
  const tasks = useLiveTasks()
  const projects = useLiveProjects()
  const today = useToday()
  const { dayStart } = useDateTimeFormat()
  const { dayLength } = useGridPrefs()
  const review = useReviewRow()
  // The bell's list: the newest in-app notifications, cached on the device (design D4).
  const notifications = useNotifications()
  return useMemo(() => (view && tasks
    ? briefingFacts({ view, today, tasks, projects, dayLength, notifications, closed: dayClosed(review, today), dayStart })
    : null), [view, tasks, projects, today, dayLength, notifications, review, dayStart])
}

/** A task named in the briefing: its own text, never translated. */
const taskTag = (s: ReactNode) => <span className="user-text text-strong" data-briefing-task>{s}</span>

function taskValues(task: BriefingTask) {
  return { title: task.title, task: taskTag }
}

/** One clause of what stands out, without its sentence start. */
function clause(fact: BriefingFact): ReactNode {
  switch (fact.kind) {
    case 'late':
      return fact.task
        ? t.rich('<task>{title}</task> is {days, plural, one {a day} other {# days}} late', { ...taskValues(fact.task), days: fact.days ?? 1 })
        : t('{n, plural, one {# task is} other {# tasks are}} late', { n: fact.count })
    case 'overfull':
      return t('today holds {planned} of work, more than your {length} day', { planned: formatMinutes(fact.planned), length: formatMinutes(fact.dayLength) })
    case 'full':
      return t('{n, plural, one {{days} is already full} other {{days} are already full}}', { n: fact.dates.length, days: formatList(fact.dates.map(weekday)) })
    case 'replies':
      if (fact.count > 1) return t('{n, plural, one {# reply is} other {# replies are}} waiting', { n: fact.count })
      if (fact.name && fact.task) return t.rich('{name} answered about <task>{title}</task>', { name: fact.name, ...taskValues(fact.task) })
      return fact.name ? t('{name} replied', { name: fact.name }) : t('{n, plural, one {# reply is} other {# replies are}} waiting', { n: 1 })
  }
}

const TONE: Record<BriefingFact['kind'], string> = { late: 'text-danger', overfull: 'text-warning', full: 'text-warning', replies: 'text-strong' }

/** Upper-cases the first letter of a clause that starts a sentence. */
function sentenceStart(node: ReactNode): ReactNode {
  return typeof node === 'string' && node ? node[0].toLocaleUpperCase() + node.slice(1) : node
}

/** The clauses joined by the language's list pattern ("a, b and c"), each in its tone, ending the sentence. */
function factsSentence(facts: readonly BriefingFact[]): ReactNode {
  const marks = facts.map((_, i) => `\u0001${i}\u0001`)
  const joined = formatList(marks, true)
  const parts = joined.split(/\u0001(\d+)\u0001/)
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part ? <Fragment key={i}>{part}</Fragment> : null
        const n = Number(part)
        const node = clause(facts[n])
        return <span key={i} className={`font-medium ${TONE[facts[n].kind]}`} data-briefing-fact={facts[n].kind}>{n === 0 ? sentenceStart(node) : node}</span>
      })}
      .
    </>
  )
}

function tomorrowSentence(tomorrow: BriefingTomorrow): ReactNode {
  if (tomorrow.count === 0 || !tomorrow.first) return t('Nothing is planned for tomorrow yet.')
  const values = { n: tomorrow.count, ...taskValues(tomorrow.first) }
  return tomorrow.first.time
    ? t.rich('Tomorrow starts with {n, plural, one {one task} other {# tasks}}; the first is <task>{title}</task> at {time}.', { ...values, time: formatTime(tomorrow.first.time) })
    : t.rich('Tomorrow starts with {n, plural, one {one task} other {# tasks}}; the first is <task>{title}</task>.', values)
}

const lead = (text: string) => <b className="font-semibold text-strong" data-briefing-lead>{text}</b>

/** The briefing as one paragraph's content: the bold lead, then the rest. */
export function BriefingText({ briefing }: { briefing: Briefing }) {
  useLanguageVersion()
  let head: string
  let rest: ReactNode
  switch (briefing.mode) {
    case 'today':
      if (briefing.facts.length) {
        head = t('{n, plural, one {One thing matters today.} =2 {Two things matter today.} =3 {Three things matter today.} other {# things matter today.}}', { n: briefing.facts.length })
        rest = factsSentence(briefing.facts)
      } else {
        head = t('Nothing stands out today.')
        rest = briefing.planned > 0
          ? t('{n, plural, one {One task is} other {# tasks are}} planned, about {time} in all.', { n: briefing.open, time: formatMinutes(briefing.planned) })
          : t('{n, plural, one {One task is} other {# tasks are}} planned.', { n: briefing.open })
      }
      break
    case 'done':
      head = t('All done for today.')
      rest = tomorrowSentence(briefing.tomorrow)
      break
    case 'clear':
      head = t('Nothing is planned for today.')
      rest = tomorrowSentence(briefing.tomorrow)
      break
    case 'upcoming':
      head = t('{n, plural, =0 {Nothing is planned for the next seven days.} one {One task in the next seven days.} other {# tasks in the next seven days.}}', { n: briefing.count })
      rest = briefing.count === 0 ? null : <>{briefing.facts.length ? factsSentence(briefing.facts) : t('Every day still has room.')} {tomorrowSentence(briefing.tomorrow)}</>
      break
  }
  return <span data-briefing={briefing.mode}>{lead(head)}{rest ? <> {rest}</> : null}</span>
}
