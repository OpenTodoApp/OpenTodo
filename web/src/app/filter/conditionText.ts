// Words for a builder condition (OpenSpec change filter-builder, design D7):
// "Label is errand", "Due on or before tomorrow", "Completed last week".
import { fieldValueText, type DateExpr, type FieldValueExpr } from '../../lib/filter'
import { formatMinutes, type Leaf } from '../../lib/filter/builder'
import type { Cmp, Keyword } from '../../lib/filter/parse'
import { msg, t, translatedMap } from '../../lib/i18n'

export const DATE_FIELD_NAME = translatedMap({
  due: msg('Due'), deadline: msg('Deadline'), start: msg('Start'), created: msg('Created'), completed: msg('Completed'),
})

/** The state keywords, in the order the editor lists them. */
export const KEYWORD_NAME = translatedMap<Keyword>({
  // The interface says "earlier", never "overdue" (page-rhythm D8); `overdue` is only the query keyword.
  overdue: msg('Due earlier'),
  today: msg('Due today'),
  tomorrow: msg('Due tomorrow'),
  'no date': msg('No due date'),
  'no time': msg('No time of day'),
  'no deadline': msg('No deadline'),
  'no start': msg('No start date'),
  'no project': msg('No project'),
  'no labels': msg('No labels'),
  someday: msg('Someday'),
  deferred: msg('Starts later'),
  evening: msg('This evening'),
  open: msg('Open'),
  completed: msg('Completed'),
  subtask: msg('Is a subtask'),
  blocked: msg('Waiting on another task'),
  unblocked: msg('Not waiting on another task'),
  habit: msg('Habit'),
  origin: msg('Has an origin'),
  'no origin': msg('No origin'),
  tracked: msg('Has tracked time'),
})

const WEEKDAY = [msg('Sunday'), msg('Monday'), msg('Tuesday'), msg('Wednesday'), msg('Thursday'), msg('Friday'), msg('Saturday')]

/** A date expression in words: "tomorrow", "this week", "in 3 days", "2 months ago". */
export function dateWords(d: DateExpr): string {
  switch (d.type) {
    case 'iso': return d.date
    case 'weekday': return t(WEEKDAY[d.day])
    case 'relative':
      if (d.days === 0) return t('today')
      if (d.days === 1) return t('tomorrow')
      if (d.days === -1) return t('yesterday')
      return d.days > 0 ? t('{n, plural, one {# day from now} other {# days from now}}', { n: d.days }) : t('{n, plural, one {# day ago} other {# days ago}}', { n: -d.days })
    case 'period':
      if (d.unit === 'week') {
        if (d.offset === 0) return t('this week')
        if (d.offset === 1) return t('next week')
        if (d.offset === -1) return t('last week')
        return t('{n, plural, one {# week ago} other {# weeks ago}}', { n: -d.offset })
      }
      if (d.offset === 0) return t('this month')
      if (d.offset === 1) return t('next month')
      if (d.offset === -1) return t('last month')
      return t('{n, plural, one {# month ago} other {# months ago}}', { n: -d.offset })
  }
}

function dateText(field: string, op: Cmp, d: DateExpr): string {
  const date = dateWords(d)
  // `=` against a period means "within" it: "Due this week".
  if (op === '=' && d.type === 'period') return t('{field} {date}', { field, date })
  switch (op) {
    case '<': return t('{field} before {date}', { field, date })
    case '<=': return t('{field} on or before {date}', { field, date })
    case '=': return t('{field} on {date}', { field, date })
    case '>=': return t('{field} on or after {date}', { field, date })
    case '>': return t('{field} after {date}', { field, date })
  }
}

function fieldValueWords(v: FieldValueExpr): string {
  if (v.type === 'date') return dateWords(v.date)
  if (v.type === 'bool') return v.value ? t('yes') : t('no')
  return fieldValueText(v)
}

function compareText(name: string, op: Cmp, value: string): string {
  switch (op) {
    case '<': return t('{name} is less than {value}', { name, value })
    case '<=': return t('{name} is at most {value}', { name, value })
    case '=': return t('{name} is {value}', { name, value })
    case '>=': return t('{name} is at least {value}', { name, value })
    case '>': return t('{name} is more than {value}', { name, value })
  }
}

/** One condition in words, without its Not. */
export function conditionText(leaf: Leaf): string {
  switch (leaf.kind) {
    case 'label': return t('Label is {name}', { name: leaf.name })
    case 'project': return leaf.descendants ? t('Project is {name} or a sub-project', { name: leaf.name }) : t('Project is {name}', { name: leaf.name })
    case 'priority': return t('Priority is P{n}', { n: leaf.value })
    case 'date': return dateText(DATE_FIELD_NAME[leaf.field], leaf.op, leaf.date)
    case 'keyword': return KEYWORD_NAME[leaf.keyword]
    case 'search': return t('Title or notes contain {text}', { text: leaf.text })
    case 'origin': return t('Origin is {value}', { value: leaf.value })
    case 'tracked': return compareText(t('Tracked time'), leaf.op, formatMinutes(leaf.minutes))
    case 'field': return compareText(leaf.name, leaf.op, fieldValueWords(leaf.value))
    case 'nofield': return t('{name} is empty', { name: leaf.name })
  }
}
