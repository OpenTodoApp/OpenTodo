// Board templates (OpenSpec change rule-boards, design D8): data for the New board
// chooser. A template is a set of saved filters, each with its on-drop rule, that
// become ordinary views (and one board of them) through the op log; nothing about
// a created board refers back to its template.
import { msg } from './i18n'
import type { OnDropRule } from './types'

export interface BoardTemplateColumn {
  /** Source message; the created filter is named with its translation. */
  name: string
  query: string
  color: string
  on_drop: OnDropRule
}

export interface BoardTemplate {
  id: string
  /** Source messages, shown through t(): the chooser's title and line, and the board's default name. */
  title: string
  description: string
  name: string
  columns: BoardTemplateColumn[]
}

/** Important: priority 1 or 2. Urgent: a due date or deadline by tomorrow. */
const IMPORTANT = '(p1 | p2)'
const URGENT = '(due <= tomorrow | deadline <= tomorrow)'

/** The four Eisenhower quadrants in matrix order (spec "Eisenhower matrix template"). */
export const EISENHOWER: BoardTemplate = {
  id: 'eisenhower',
  title: msg('Eisenhower matrix'),
  name: msg('Eisenhower'),
  description: msg('Four views over priority and date: sort work by urgent and important, and drag a card to re-plan it.'),
  columns: [
    { name: msg('Urgent and important'), query: `${IMPORTANT} & ${URGENT}`, color: '#ef4444', on_drop: { priority: 1, due: 'today' } },
    { name: msg('Important, not urgent'), query: `${IMPORTANT} & !${URGENT} & !someday`, color: '#3b82f6', on_drop: { priority: 2, due: 'next-week' } },
    { name: msg('Urgent, not important'), query: `!${IMPORTANT} & ${URGENT}`, color: '#f97316', on_drop: { priority: 3, due: 'today' } },
    { name: msg('Neither'), query: `!${IMPORTANT} & !${URGENT} & !someday`, color: '#64748b', on_drop: { priority: 4, due: 'clear' } },
  ],
}

export const BOARD_TEMPLATES: readonly BoardTemplate[] = [EISENHOWER]
