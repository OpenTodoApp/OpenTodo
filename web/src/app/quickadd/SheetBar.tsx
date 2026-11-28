// Quick add on a phone (OpenSpec change palette-quick-add, design D7;
// natural-language-capture "Quick add tools on a phone"): under the line, one neutral
// chip per understood attribute (× keeps its words as text), Today, Tomorrow and Next
// week as dashed chips while the line has no date (phone-delight D6), and a dashed
// placeholder for the project and the label while the line sets none; then a tool row that starts
// a token at the end of the line, a Notes tool that opens the notes field
// (quick-add-notes D2), and the send button. The buttons never take focus from the
// fields, so the keyboard stays up.
import { logicalToday, quickChoices } from '../../lib/dates'
import { findLabel, type Chip, type LabelRef, type ProjectRef } from '../../lib/nlp'
import type { Due } from '../../lib/types'
import { t } from '../../lib/i18n'
import { Icon } from '../../ui'
import { chipText } from '../ParseChips'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { ProjectMark } from '../ProjectMark'
import { FIELD_ICON, fieldOf, type FieldKind, type QuickAddProject } from './fields'
import { FIELD_NAME } from './FieldRows'
import { LineDatePicker, type LineDate } from './LineDatePicker'

// The dates a line without one offers in one tap (phone-delight D6), from the date picker's quick dates.
const DATE_CHIPS = new Set(['today', 'tomorrow', 'next-week'])

// The tools that start a token the line understands. A date has no token (dates are
// words, "tomorrow"): its tool opens the date picker instead (phone-quickadd-date-picker).
const TOOLS: FieldKind[] = ['priority', 'label', 'estimate', 'project']
const keepFocus = (e: React.MouseEvent) => e.preventDefault()

function chipWords(chip: Chip, projects: readonly ProjectRef[], labels: readonly LabelRef[], line?: { due: Due | null; datedByPhrase: boolean }): string {
  const text = chipText(chip, projects, labels, line)
  if (chip.kind === 'project') return text.slice(1)
  if (chip.kind === 'label') return findLabel(String(chip.value), labels) ? text.slice(1) : t('New label “{name}”', { name: String(chip.value) })
  return text
}

export function SheetBar({ chips, projects, labels, line, onDismiss, onStart, canSend, energy = false, notes, date }: {
  chips: readonly Chip[]
  projects: readonly QuickAddProject[]
  labels: readonly LabelRef[]
  line?: { due: Due | null; datedByPhrase: boolean }
  onDismiss: (chip: Chip) => void
  /** Starts a field's token at the end of the line. */
  onStart: (kind: FieldKind) => void
  canSend: boolean
  /** The account offers energy (task-energy D3): a tool starts `~`, so a phone reaches the levels by touch. */
  energy?: boolean
  /** The notes field under the line (quick-add-notes D2): the last tool opens it and moves the caret there. */
  notes?: { open: boolean; start: () => void }
  /** The date tool (phone-quickadd-date-picker): opens the date picker above the chips. */
  date?: LineDate
}) {
  const tools: FieldKind[] = energy ? [...TOOLS, 'energy'] : TOOLS
  const set = new Set(chips.map((c) => fieldOf(c.kind)))
  const placeholders = (['project', 'label'] as const).filter((k) => !set.has(k))
  const { resolved } = useDateTimeFormat()
  const dates = date && !set.has('when') ? quickChoices('due', logicalToday(), resolved).filter((c) => DATE_CHIPS.has(c.id)) : []
  return (
    <div data-quick-add-sheet-bar>
      {date?.open && <LineDatePicker id={date.id} due={date.due} onPick={date.pick} onKeyDown={date.escape} />}
      {/* The chips wrap: a row that scrolls sideways fails reflow at 320 CSS px (WCAG 1.4.10, the accessibility gate's M18). */}
      <div className="flex flex-wrap gap-1.5 px-3 pb-3 pt-1" role="group" aria-label={t('Understood')}>
        {chips.map((c) => {
          const project = c.kind === 'project' ? projects.find((p) => p.id === c.value) : undefined
          return (
            <span key={c.key} data-sheet-chip={c.kind} className="inline-flex h-[1.875rem] shrink-0 items-center gap-1.5 rounded-full border border-default bg-raised ps-2.5 pe-1 text-body text-strong">
              {project?.color
                ? <ProjectMark project={{ color: project.color, icon: project.icon }} size="xs" />
                : <Icon name={FIELD_ICON[fieldOf(c.kind)]} size={14} className="text-muted" />}
              <span className="sr-only">{FIELD_NAME[fieldOf(c.kind)]}: </span>
              {chipWords(c, projects, labels, line)}
              <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded-full text-faint hover:bg-sunken hover:text-default" onMouseDown={keepFocus}
                aria-label={t('Keep “{source}” as text', { source: c.spans.map((s) => s.text).join(' … ') })} onClick={() => onDismiss(c)}>
                <Icon name="x" size="xs" />
              </button>
            </span>
          )
        })}
        {/* A date in one tap: the same as the When tool's quick dates, so hidden from assistive technology like the placeholders. */}
        {dates.map((c) => (
          <button key={c.id} type="button" data-sheet-date={c.id} onMouseDown={keepFocus} onClick={() => date?.pick({ date: c.date as string })} aria-hidden="true" tabIndex={-1}
            className="inline-flex h-[1.875rem] shrink-0 items-center gap-1.5 rounded-full border border-dashed border-input px-2.5 text-body text-faint">
            <Icon name={FIELD_ICON.when} size={14} />{c.label}
          </button>
        ))}
        {/* A tap target for the same action as the toolbar's Project and Label below, so hidden from
            assistive technology and the tab order: a screen reader met each name twice. */}
        {placeholders.map((k) => (
          <button key={k} type="button" data-sheet-placeholder={k} onMouseDown={keepFocus} onClick={() => onStart(k)} aria-hidden="true" tabIndex={-1}
            className="inline-flex h-[1.875rem] shrink-0 items-center gap-1.5 rounded-full border border-dashed border-input px-2.5 text-body text-faint">
            <Icon name={FIELD_ICON[k]} size={14} />{FIELD_NAME[k]}
          </button>
        ))}
      </div>
      {/* Wraps at 320 CSS px, where seven tools and the send button are wider than the sheet (WCAG 1.4.10). */}
      <div className="flex flex-wrap items-center gap-1 border-t border-default px-2.5 py-2" role="toolbar" aria-label={t('Add details')}>
        {date && (
          <button type="button" data-sheet-tool="when" onMouseDown={keepFocus} onClick={date.toggle} aria-label={FIELD_NAME.when} aria-expanded={date.open} aria-controls={date.id}
            className={`inline-flex h-[2.375rem] w-[2.375rem] items-center justify-center rounded-control hover:bg-hover hover:text-default ${date.open ? 'bg-selected text-default' : 'text-muted'}`}>
            <Icon name={FIELD_ICON.when} size={18} />
          </button>
        )}
        {tools.map((k) => (
          <button key={k} type="button" data-sheet-tool={k} onMouseDown={keepFocus} onClick={() => onStart(k)} aria-label={FIELD_NAME[k]}
            className="inline-flex h-[2.375rem] w-[2.375rem] items-center justify-center rounded-control text-muted hover:bg-hover hover:text-default">
            <Icon name={FIELD_ICON[k]} size={18} />
          </button>
        ))}
        {notes && (
          <button type="button" data-sheet-tool="notes" onMouseDown={keepFocus} onClick={notes.start} aria-label={t('Notes')} aria-pressed={notes.open}
            className={`inline-flex h-[2.375rem] w-[2.375rem] items-center justify-center rounded-control hover:bg-hover hover:text-default ${notes.open ? 'text-default' : 'text-muted'}`}>
            <Icon name="text-quote" size={18} />
          </button>
        )}
        <button type="submit" onMouseDown={keepFocus} disabled={!canSend} aria-label={t('Add task')} data-sheet-send
          className="ms-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-on-accent disabled:opacity-40">
          <Icon name="arrow-up" size={18} />
        </button>
      </div>
    </div>
  )
}
