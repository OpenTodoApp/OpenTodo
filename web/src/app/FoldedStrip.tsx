// The button of a folded board column (OpenSpec change board-polish, design D2): the
// column's mark, its count and its name written vertically, one control whose
// accessible name gives the name, the count and the folded state; activating it
// unfolds the column. The strip around it (the drop target) is drawn by the board,
// so a folded column takes drops before this loads. Loaded with the first fold.
import type { ReactNode } from 'react'
import { Tooltip } from '../ui'

export default function FoldedStrip({ id, name, label, count, mark, onUnfold }: {
  /** The column key, for tests and stories. */
  id: string
  name: string
  /** "Done, 12 open tasks, folded". */
  label: string
  count: number
  /** The section's icon or colour dot. */
  mark?: ReactNode
  onUnfold: () => void
}) {
  return (
    <Tooltip label={name} side="right">
      <button type="button" aria-expanded={false} aria-label={label} onClick={onUnfold} data-column-strip={id}
        className="flex h-full min-h-0 w-full flex-col items-center gap-2 rounded-card px-1 py-2.5 text-default outline-none focus-visible:ring-2 focus-visible:ring-focus">
        {mark}
        {/* The name comes first in the text, so the visible words start the accessible name; the count is drawn above it. */}
        <span className="order-2 min-h-0 truncate text-body font-semibold [writing-mode:vertical-rl]">{name}</span>{' '}
        <span className="order-1 text-meta tabular-nums text-muted">{count}</span>
      </button>
    </Tooltip>
  )
}
