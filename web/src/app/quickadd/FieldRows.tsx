// The quick-add palette's understanding (OpenSpec change palette-quick-add, design D2,
// D3): one row per field with its icon, name, value or hint, and the token that sets
// it; a set row keeps its words as text with ×. The rows are driven from the field
// (↑/↓ highlight, Tab edits), so they are not in the tab order themselves; a click
// edits too. The footer reads the title as it will be saved and the keys.
import type { ReactNode } from 'react'
import { findLabel, formatMinutes, type LabelRef, type ProjectRef } from '../../lib/nlp'
import type { Due } from '../../lib/types'
import { msg, t, translatedMap } from '../../lib/i18n'
import { Icon } from '../../ui'
import { chipText } from '../ParseChips'
import { FIELD_ICON, FIELD_TOKEN, type FieldKind, type FieldRow, projectColor } from './fields'

export const FIELD_NAME = translatedMap<FieldKind>({
  when: msg('When'), project: msg('Project'), label: msg('Label'), priority: msg('Priority'), estimate: msg('Estimate'),
  deadline: msg('Deadline'), recurrence: msg('Repeats'), reminder: msg('Reminder'), spent: msg('Time spent'),
})

/** What an unset row says: how to set it. */
export function fieldHint(kind: FieldKind): string {
  return kind === 'when' ? t('none · type a day or a date') : t('none · type “{token}”', { token: EXAMPLE[kind] ?? '' })
}
const EXAMPLE: Partial<Record<FieldKind, string>> = { project: '#', label: '@', priority: 'p1', estimate: '+30m' }

// Literal classes, so the stylesheet keeps them: the P1–P4 ring colours.
const RING: Record<number, string> = { 1: 'border-p1', 2: 'border-p2', 3: 'border-p3', 4: 'border-p4' }

interface Line { due: Due | null; datedByPhrase: boolean }

/** A set row's value in words: the project's name and colour, "Priority 2", "30 min". */
function FieldValue({ row, projects, labels, line }: { row: FieldRow; projects: readonly ProjectRef[]; labels: readonly LabelRef[]; line?: Line }) {
  const chip = row.chip!
  if (chip.kind === 'project') {
    const color = projectColor(projects.find((x) => x.id === chip.value))
    return <>{color && <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />}{chipText(chip, projects, labels, line).slice(1)}</>
  }
  if (chip.kind === 'label') {
    const l = findLabel(String(chip.value), labels)
    return l ? <>{chipText(chip, projects, labels, line).slice(1)}</> : <>{t('New label “{name}”', { name: String(chip.value) })}</>
  }
  if (chip.kind === 'priority') return <><span aria-hidden="true" className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px] ${RING[chip.value as number] ?? RING[4]}`} />{t('Priority {n}', { n: chip.value as number })}</>
  if (chip.kind === 'estimate') return <>{formatMinutes(chip.value as number)}</>
  return <>{chipText(chip, projects, labels, line)}</>
}

export function FieldRows({ rows, highlight, chipHighlight, projects, labels, line, onEdit, onDismiss }: {
  rows: readonly FieldRow[]
  /** The row ↑/↓ highlighted, or null. */
  highlight: number | null
  /** The chip Backspace highlighted, about to be dismissed. */
  chipHighlight: number | null
  projects: readonly ProjectRef[]
  labels: readonly LabelRef[]
  line?: Line
  onEdit: (row: FieldRow) => void
  onDismiss: (row: FieldRow) => void
}) {
  return (
    <div className="py-1" data-field-rows>
      {rows.map((row, i) => {
        const on = highlight === i
        const key = FIELD_TOKEN[row.kind]
        return (
          <div key={`${row.kind}:${row.chip?.key ?? 'unset'}`} data-field-row={row.kind} data-set={row.chip ? '' : undefined} data-highlighted={on || undefined}
            className={`relative grid h-8 cursor-pointer grid-cols-[1rem_5rem_minmax(0,1fr)_auto] items-center gap-2.5 px-4 text-meta pointer-coarse:h-11 ${on ? 'row-selected' : 'hover:bg-hover'} ${row.chip && chipHighlight === row.chipIndex ? 'ring-2 ring-inset ring-focus' : ''}`}
            onMouseDown={(e) => e.preventDefault()} onClick={() => onEdit(row)}>
            <Icon name={FIELD_ICON[row.kind]} size={14} className="text-faint" />
            <span className="text-muted">{FIELD_NAME[row.kind]}</span>
            <span className={`flex min-w-0 items-center gap-1.5 truncate ${row.chip ? 'text-default' : 'text-faint'}`}>
              {row.chip ? <FieldValue row={row} projects={projects} labels={labels} line={line} /> : fieldHint(row.kind)}
            </span>
            <span className="flex items-center gap-1.5">
              {row.chip && (
                <button type="button" tabIndex={-1} className="inline-flex h-6 w-6 items-center justify-center rounded-chip text-faint hover:bg-sunken hover:text-default"
                  aria-label={t('Keep “{source}” as text', { source: row.chip.spans.map((s) => s.text).join(' … ') })} data-keep-text
                  onClick={(e) => { e.stopPropagation(); onDismiss(row) }}>
                  <Icon name="x" size="xs" />
                </button>
              )}
              {key && <kbd className="ui-kbd" aria-hidden="true">{key}</kbd>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Key names as the registry and the keycaps spell them (not translated, like every keycap).
const KEYS = { enter: 'Enter', shiftEnter: 'Shift+Enter', esc: 'Esc' }

/** One key and what it does, in the footer. */
export function KeyHint({ keys, children }: { keys: ReactNode; children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap">{keys}<span>{children}</span></span>
}

/** The palette's footer: the title as it will be saved, Enter, Shift+Enter and Escape. */
export function QuickAddFooter({ title, empty, escape }: { title: string | null; empty: boolean; escape?: { label: string; run: () => void } }) {
  return (
    <div className="flex items-center gap-3.5 border-t border-default bg-raised px-3.5 py-2 text-meta text-muted" data-quick-add-footer>
      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate" data-testid="quick-add-title">
        {title === null
          ? <><Icon name="sparkles" size="sm" className="text-faint" />{t('Understood as you type')}</>
          : <><Icon name="arrow-right" size="xs" /><span className="sr-only">{t('Title:')}{' '}</span>{empty ? <em>{t('Type a title')}</em> : <span className="truncate text-default">{title}</span>}</>}
      </span>
      <span className="hidden items-center gap-3.5 pointer-fine:flex">
        <KeyHint keys={<kbd className="ui-kbd">{KEYS.enter}</kbd>}>{t('Add')}</KeyHint>
        <KeyHint keys={<kbd className="ui-kbd">{KEYS.shiftEnter}</kbd>}>{t('Add and open')}</KeyHint>
      </span>
      {escape && (
        <button type="button" className="inline-flex items-center gap-1.5 rounded-chip px-1 hover:text-default" onClick={escape.run} data-quick-add-escape>
          <kbd className="ui-kbd">{KEYS.esc}</kbd>{escape.label}
        </button>
      )}
    </div>
  )
}
