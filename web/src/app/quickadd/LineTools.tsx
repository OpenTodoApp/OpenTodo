// Quick add in a list (OpenSpec change add-task-button, design D2): beside the field, the
// calendar and one compact button per field a mouse would otherwise type: Priority,
// Project and Label. Each starts its token at the end of the line (or selects the words
// that set it) and opens the line's own suggestions, as the phone's tool row does, so
// the parse stays the one model. A click keeps the focus in the field.
import type { Chip } from '../../lib/nlp'
import { t } from '../../lib/i18n'
import { Icon } from '../../ui'
import { FIELD_ICON, fieldOf, type FieldKind, type FieldRow } from './fields'
import { FIELD_NAME } from './FieldRows'
import { LineDateButton, type LineDate } from './LineDatePicker'

const LINE_TOOLS: FieldKind[] = ['priority', 'project', 'label']

export function LineTools({ chips, date, onEdit }: { chips: readonly Chip[]; date?: LineDate; onEdit: (row: FieldRow) => void }) {
  return (
    <span className="flex items-center" role="group" aria-label={t('Add details')} data-quick-add-tools>
      {date && <LineDateButton date={date} />}
      {LINE_TOOLS.map((kind) => {
        const chipIndex = chips.findIndex((c) => fieldOf(c.kind) === kind)
        const chip = chipIndex >= 0 ? chips[chipIndex] : undefined
        return (
          <button key={kind} type="button" data-quick-add-tool={kind} data-set={chip ? '' : undefined} aria-label={FIELD_NAME[kind]}
            onMouseDown={(e) => e.preventDefault()} onClick={() => onEdit(chip ? { kind, chip, chipIndex } : { kind })}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-control hover:bg-hover hover:text-default max-sm:hidden ${chip ? 'text-default' : 'text-faint'}`}>
            <Icon name={FIELD_ICON[kind]} size={16} />
          </button>
        )
      })}
    </span>
  )
}
