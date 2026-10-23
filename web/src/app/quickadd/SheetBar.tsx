// Quick add on a phone (OpenSpec change palette-quick-add, design D7;
// natural-language-capture "Quick add tools on a phone"): under the line, one neutral
// chip per understood attribute (× keeps its words as text) and a dashed placeholder
// for the project and the label while the line sets none; then a tool row that starts
// a token at the end of the line, and the send button. The buttons never take focus
// from the field, so the keyboard stays up.
import { findLabel, type Chip, type LabelRef, type ProjectRef } from '../../lib/nlp'
import type { Due } from '../../lib/types'
import { t } from '../../lib/i18n'
import { Icon } from '../../ui'
import { chipText } from '../ParseChips'
import { FIELD_ICON, fieldOf, type FieldKind, projectColor } from './fields'
import { FIELD_NAME } from './FieldRows'

const TOOLS: FieldKind[] = ['when', 'priority', 'label', 'estimate', 'project']
const keepFocus = (e: React.MouseEvent) => e.preventDefault()

function chipWords(chip: Chip, projects: readonly ProjectRef[], labels: readonly LabelRef[], line?: { due: Due | null; datedByPhrase: boolean }): string {
  const text = chipText(chip, projects, labels, line)
  if (chip.kind === 'project') return text.slice(1)
  if (chip.kind === 'label') return findLabel(String(chip.value), labels) ? text.slice(1) : t('New label “{name}”', { name: String(chip.value) })
  return text
}

export function SheetBar({ chips, projects, labels, line, onDismiss, onStart, canSend }: {
  chips: readonly Chip[]
  projects: readonly ProjectRef[]
  labels: readonly LabelRef[]
  line?: { due: Due | null; datedByPhrase: boolean }
  onDismiss: (chip: Chip) => void
  /** Starts a field's token at the end of the line. */
  onStart: (kind: FieldKind) => void
  canSend: boolean
}) {
  const set = new Set(chips.map((c) => fieldOf(c.kind)))
  const placeholders = (['project', 'label'] as const).filter((k) => !set.has(k))
  return (
    <div data-quick-add-sheet-bar>
      <div className="flex gap-1.5 overflow-x-auto px-3 pb-3 pt-1 [scrollbar-width:none]" role="group" aria-label={t('Understood')}>
        {chips.map((c) => {
          const color = c.kind === 'project' ? projectColor(projects.find((p) => p.id === c.value)) : undefined
          return (
            <span key={c.key} data-sheet-chip={c.kind} className="inline-flex h-[1.875rem] shrink-0 items-center gap-1.5 rounded-full border border-default bg-raised pl-2.5 pr-1 text-body text-strong">
              {color
                ? <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
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
        {placeholders.map((k) => (
          <button key={k} type="button" data-sheet-placeholder={k} onMouseDown={keepFocus} onClick={() => onStart(k)}
            className="inline-flex h-[1.875rem] shrink-0 items-center gap-1.5 rounded-full border border-dashed border-input px-2.5 text-body text-faint">
            <Icon name={FIELD_ICON[k]} size={14} />{FIELD_NAME[k]}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 border-t border-default px-2.5 py-2" role="toolbar" aria-label={t('Add details')}>
        {TOOLS.map((k) => (
          <button key={k} type="button" data-sheet-tool={k} onMouseDown={keepFocus} onClick={() => onStart(k)} aria-label={FIELD_NAME[k]}
            className="inline-flex h-[2.375rem] w-[2.375rem] items-center justify-center rounded-control text-muted hover:bg-hover hover:text-default">
            <Icon name={FIELD_ICON[k]} size={18} />
          </button>
        ))}
        <span className="flex-1" />
        <button type="submit" onMouseDown={keepFocus} disabled={!canSend} aria-label={t('Add task')} data-sheet-send
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-on-accent disabled:opacity-40">
          <Icon name="arrow-up" size={18} />
        </button>
      </div>
    </div>
  )
}
