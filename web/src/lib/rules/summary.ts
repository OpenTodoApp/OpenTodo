// The one-line wording of an automation rule for the Rules page (automation-rules
// D11): "When label waiting is added · in Work → section Waiting of Work". The
// action half reuses the column rule's wording (describeRule).
import { weekday } from '../dates'
import { t } from '../i18n'
import type { OnDropRule, Rule, RuleActions, RuleCondition, RuleTrigger } from '../types'
import { ruleParts, type RuleNames } from '.'
import { addDays } from './match'

// 2026-10-19 is a Monday: weekday n (1 Monday … 7 Sunday) in the date locale.
const dayName = (n: number): string => weekday(addDays('2026-10-19', n - 1))

const nameOf = (list: readonly { id: string; name: string; deleted_at: number | null }[], id: string | null | undefined): string =>
  list.find((x) => x.id === id && !x.deleted_at)?.name ?? t('a removed item')

/** The trigger as a phrase ("when a task is created"). */
export function triggerText(tr: RuleTrigger | null | undefined, names: RuleNames): string {
  switch (tr?.kind) {
    case 'task.created': return t('when a task is created')
    case 'task.completed': return t('when a task is completed')
    case 'task.reopened': return t('when a task is reopened')
    case 'label.added': return t('when label {label} is added', { label: nameOf(names.labels, tr.label_id) })
    case 'label.removed': return t('when label {label} is removed', { label: nameOf(names.labels, tr.label_id) })
    case 'assigned.to_me': return t('when a task is assigned to me')
    case 'task.moved': return tr.section_id
      ? t('when a task is moved to {section} of {project}', { section: nameOf(names.sections, tr.section_id), project: nameOf(names.projects, tr.project_id) })
      : t('when a task is moved to {project}', { project: nameOf(names.projects, tr.project_id) })
    case 'due.reached': return t('when a task is due')
    case 'overdue': return t('when a task’s date passes')
    case 'schedule': {
      const days = (tr.weekdays ?? []).slice().sort()
      const every = days.length === 7 ? t('every day') : days.map(dayName).join(', ')
      return t('{days} at {time}', { days: every, time: tr.at ?? '' })
    }
    default: return t('when something this version does not know happens')
  }
}

function dateText(p: RuleCondition['due']): string {
  if (p === 'none') return t('no date')
  if (p === 'set') return t('has a date')
  if (p === 'today') return t('today')
  if (p === 'overdue') return t('due earlier')
  if (p && typeof p === 'object') return t('{n, plural, one {within # day} other {within # days}}', { n: p.within_days })
  return ''
}

/** The condition as short phrases ("label errand", "priority 1"). */
export function conditionParts(c: RuleCondition | null | undefined, names: RuleNames): string[] {
  if (!c) return []
  const parts: string[] = []
  const labels = (ids: string[] | undefined) => (ids ?? []).map((id) => nameOf(names.labels, id)).join(', ')
  if (c.project === 'none') parts.push(t('no project'))
  else if (c.project) parts.push(t('in {projects}', { projects: c.project.in.map((id) => nameOf(names.projects, id)).join(', ') }))
  if (c.section === 'none') parts.push(t('no section'))
  else if (c.section) parts.push(t('section {sections}', { sections: c.section.in.map((id) => nameOf(names.sections, id)).join(', ') }))
  if (c.labels?.any?.length) parts.push(t('any of {labels}', { labels: labels(c.labels.any) }))
  if (c.labels?.all?.length) parts.push(t('label {labels}', { labels: labels(c.labels.all) }))
  if (c.labels?.none?.length) parts.push(t('without {labels}', { labels: labels(c.labels.none) }))
  if (c.priority) parts.push(t('priority {p}', { p: c.priority.in.join(', ') }))
  if (c.due !== undefined) parts.push(t('due: {when}', { when: dateText(c.due) }))
  if (c.deadline !== undefined) parts.push(t('deadline: {when}', { when: dateText(c.deadline) }))
  if (c.start === 'someday') parts.push(t('someday'))
  else if (c.start === 'deferred') parts.push(t('deferred'))
  else if (c.start === 'none') parts.push(t('no start'))
  if (c.evening !== undefined) parts.push(c.evening ? t('this evening') : t('not this evening'))
  if (c.blocked !== undefined) parts.push(c.blocked ? t('blocked') : t('not blocked'))
  if (c.assignee === 'me') parts.push(t('assigned to me'))
  else if (c.assignee === 'none') parts.push(t('unassigned'))
  else if (c.assignee === 'anyone') parts.push(t('assigned'))
  if (c.origin === 'none') parts.push(t('no origin'))
  else if (c.origin) parts.push(t('origin {kind}', { kind: c.origin.kind }))
  if (c.habit !== undefined) parts.push(c.habit ? t('habit') : t('not a habit'))
  if (c.estimate === 'none') parts.push(t('no estimate'))
  else if (c.estimate && 'min_minutes' in c.estimate) parts.push(t('estimate at least {n} min', { n: c.estimate.min_minutes }))
  else if (c.estimate) parts.push(t('estimate at most {n} min', { n: c.estimate.max_minutes }))
  if (c.tracked === 'none') parts.push(t('nothing tracked'))
  else if (c.tracked) parts.push(t('tracked at least {n} min', { n: c.tracked.min_minutes }))
  return parts
}

/** The actions as short phrases, the column rule's wording plus the automation keys. */
export function actionParts(a: RuleActions | null | undefined, names: RuleNames): string[] {
  if (!a) return []
  const parts = ruleParts(a as OnDropRule, names)
  if (a.due && typeof a.due === 'object') parts.push(t('{n, plural, one {due in # day} other {due in # days}}', { n: a.due.in_days }))
  if (a.deadline === 'clear') parts.push(t('deadline cleared'))
  else if (a.deadline) parts.push(t('{n, plural, one {deadline in # day} other {deadline in # days}}', { n: a.deadline.in_days }))
  if (a.assignee === 'me') parts.push(t('assigns to me'))
  else if (a.assignee === 'clear') parts.push(t('unassigns'))
  if (a.comment) parts.push(t('adds a comment'))
  if (a.notify) parts.push(t('notifies me'))
  if (a.webhook) parts.push(t('sends a webhook'))
  return parts
}

/** The rule in one line: trigger · condition → actions. */
export function summarizeRule(rule: Pick<Rule, 'trigger' | 'condition' | 'actions'>, names: RuleNames): string {
  const when = triggerText(rule.trigger, names)
  const cond = conditionParts(rule.condition, names).join(', ')
  const head = (cond ? `${when} · ${cond}` : when)
  const text = `${head} → ${actionParts(rule.actions, names).join(', ')}`
  return text.charAt(0).toLocaleUpperCase() + text.slice(1)
}
