// A proposal before and after (OpenSpec change assistant-proposal-editing): each
// item's fields side by side, the value on this device now and the proposed one.
// A new item has nothing before. Read from the device's rows; part of the lazy
// proposal shapes chunk.
import type { Review, ReviewItem } from '../../../lib/assistant'
import { formatDate, formatTime } from '../../../lib/dates'
import { useProposalBefore, type ProposalNames as Names } from '../../../lib/assistantBlockData'
import { formatMinutes } from '../../../lib/duration'
import { t } from '../../../lib/i18n'
import { priorityShort } from '../../../lib/priority'
import { ItemMarks } from './ProposalShapes'

type Row = Record<string, unknown>

// Fields that say nothing to a person, never shown.
const HIDDEN = new Set(['position', 'created_at', 'notes_doc', 'sample', 'appends', 'workspace_id'])

const FIELD: Record<string, () => string> = {
  title: () => t('Title'), name: () => t('Name'), due: () => t('Do on'), start: () => t('Start'), deadline: () => t('Deadline'), priority: () => t('Priority'),
  project_id: () => t('Project'), section_id: () => t('Section'), labels: () => t('Labels'), estimate_minutes: () => t('Estimate'), evening: () => t('Evening'),
  location: () => t('Location'), description: () => t('Description'), recurrence: () => t('Repeat'), completed_at: () => t('Status'), deleted_at: () => t('Status'),
}

const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** A field's value in words; empty for nothing. */
function words(field: string, v: unknown, names: Names): string {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) {
    return field === 'project_id' ? t('Inbox') : field === 'completed_at' ? t('Open') : ''
  }
  switch (field) {
    case 'due': {
      const d = v as { date?: string; time?: string }
      return d.date ? `${formatDate(d.date, 'compact')}${d.time ? ` ${formatTime(d.time)}` : ''}` : ''
    }
    case 'start':
      return v === 'someday' ? t('Someday') : formatDate(String(v), 'compact')
    case 'deadline':
      return formatDate(String(v), 'compact')
    case 'priority':
      return priorityShort(Number(v))
    case 'project_id':
      return names.projects.get(String(v)) ?? t('a project')
    case 'section_id':
      return names.sections.get(String(v)) ?? t('a section')
    case 'labels':
      return (v as string[]).map((id) => names.labels.get(id) ?? t('a label')).join(', ')
    case 'estimate_minutes':
      return formatMinutes(Number(v))
    case 'evening':
      return v ? t('Evening') : ''
    case 'location': {
      const l = v as { name?: string; address?: string }
      return clip(l.name || l.address || t('a place'))
    }
    case 'completed_at':
      return t('Completed')
    case 'deleted_at':
      return t('Moved to the Trash')
    default:
      return clip(typeof v === 'string' ? v : JSON.stringify(v))
  }
}

/** Each item's title and marks, then its fields with the value now and the proposed one. */
export function BeforeAfter({ review }: { review: Review }) {
  const loaded = useProposalBefore(review)
  if (!loaded) return null
  // One table: the column heads once, then each item as a group of its fields.
  return (
    <table className="w-full table-fixed text-left text-meta" aria-label={t('Before and after')} data-before-after>
      <colgroup><col className="w-28" /><col /><col /></colgroup>
      <thead>
        <tr className="border-b border-soft text-faint">
          <th scope="col" className="py-1.5 pl-3 font-normal"><span className="sr-only">{t('Field')}</span></th>
          <th scope="col" className="py-1.5 pr-3 font-normal">{t('Before')}</th>
          <th scope="col" className="py-1.5 pr-3 font-normal">{t('After')}</th>
        </tr>
      </thead>
      {review.items.map((item, i) => <ItemDiff key={item.change.entity + item.change.entityId} item={item} row={loaded.rows[i]} names={loaded.names} />)}
    </table>
  )
}

function ItemDiff({ item, row, names }: { item: ReviewItem; row: Row | null; names: Names }) {
  const fields = Object.keys(item.change.patch).filter((f) => !HIDDEN.has(f) && FIELD[f])
  return (
    <tbody className="border-b border-soft last:border-b-0" data-review-item={item.change.entityId}>
      <tr>
        <th scope="rowgroup" colSpan={3} className={`px-3 pt-2 pb-0.5 text-body font-normal user-text ${item.checked ? 'text-default' : 'text-muted'}`}>{item.title}<ItemMarks item={item} /></th>
      </tr>
      {fields.map((f, i) => {
        const before = item.change.create ? '' : words(f, { ...(row ?? {}), ...(item.change.base ?? {}) }[f], names)
        const after = words(f, item.change.patch[f], names)
        const last = i === fields.length - 1 ? 'pb-2' : ''
        return (
          <tr key={f}>
            <th scope="row" className={`pl-3 pr-3 font-normal text-muted ${last}`}>{FIELD[f]()}</th>
            <td className={`truncate pr-3 text-muted user-text ${last}`} data-before={f}>{before || '—'}</td>
            <td className={`truncate pr-3 font-medium text-default user-text ${last}`} data-after={f}>{after || '—'}</td>
          </tr>
        )
      })}
    </tbody>
  )
}
