// A project's board in an answer (OpenSpec change assistant-project-blocks, spec
// "Project view blocks"): one column at a time, the board's own cards, read-only.
// The block names a column, or shows the first with cards and lets the others be
// chosen; it never scrolls sideways. A card opens its task; ticking is the app's own
// completion with its Undo, as in task rows. Lazy chunk.
import { useMemo, useState } from 'react'
import type { AssistantBlock } from '../../../lib/assistantBlocks'
import { useBlockBoard, type BlockColumn } from '../../../lib/assistantBlockData'
import { t } from '../../../lib/i18n'
import { resolveLabels } from '../../../lib/labels'
import { useAllLabels, useMembershipMap } from '../../../lib/localData'
import { canEditTask } from '../../../lib/sharing'
import { Icon } from '../../../ui'
import { act } from '../../actionError'
import { openTaskPanel } from '../../panel'
import { navigate } from '../../router'
import { TaskRow } from '../../TaskRow'
import { completeWithUndo } from '../../undoable'

/** The most cards a column shows; the rest are counted. */
const MAX_CARDS = 12

const nameOf = (c: BlockColumn) => (c.section ? c.section.name || t('Untitled section') : t('No section'))

export default function BoardBlock({ block }: { block: Extract<AssistantBlock, { kind: 'board' }> }) {
  const board = useBlockBoard(block.id)
  const labels = useAllLabels()
  const memberships = useMembershipMap()
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const [chosen, setChosen] = useState<string | null>(null)
  if (!board) return null
  if (!board.project) return <p className="p-3 text-meta text-muted">{t('Removed')}</p>
  const named = block.section_id ? board.columns.find((c) => c.key === block.section_id) : undefined
  if (block.section_id && !named) return <p className="p-3 text-meta text-muted">{t('Removed')}</p>
  const col = named ?? board.columns.find((c) => c.key === chosen) ?? board.columns.find((c) => c.cards.length) ?? board.columns[0]
  const more = col.cards.length - MAX_CARDS
  return (
    <div className="space-y-2 p-3" data-assistant-board>
      <p className="flex min-w-0 items-center gap-1.5 text-body font-semibold">
        <Icon name="kanban" size="sm" className="shrink-0 text-muted" />
        <span className="truncate user-text">{board.project.name}</span>
        {named && <><span aria-hidden="true" className="text-faint">/</span><span className="truncate user-text" data-board-column-name>{nameOf(named)}</span></>}
      </p>
      {!named && board.columns.length > 1 && (
        // The other columns to switch to: they wrap, so the block never scrolls sideways (design "Interface budget").
        <div className="flex flex-wrap gap-1" role="group" aria-label={t('Columns')} data-board-columns>
          {board.columns.map((c) => (
            <button key={c.key || 'none'} type="button" aria-pressed={c.key === col.key} onClick={() => setChosen(c.key)} data-board-column={c.key}
              className={`touch-target inline-flex min-h-6 items-center gap-1.5 rounded-chip px-2 text-meta ${c.key === col.key ? 'bg-accent-soft font-medium text-on-accent-soft' : 'text-muted hover:bg-hover'}`}>
              <span className="user-text">{nameOf(c)}</span><span className="tabular-nums text-faint">{c.cards.length}</span>
            </button>
          ))}
        </div>
      )}
      <section className="ui-column rounded-card p-1.5" aria-label={t('{name}, {n, plural, one {# open task} other {# open tasks}}', { name: nameOf(col), n: col.cards.length })} data-board-cards={col.key}>
        {col.cards.length === 0
          ? <p className="px-2 py-3 text-meta text-faint">{t('No open tasks')}</p>
          : (
            <ul className="ui-cards--lift space-y-1.5">
              {col.cards.slice(0, MAX_CARDS).map((task) => (
                <TaskRow key={task.id} shape="card" task={task} labels={resolveLabels(task.labels, labelMap)} showProject={false} selected={false} actions={false}
                  readOnly={!canEditTask(task, memberships)} onToggle={() => act(completeWithUndo(task.id, !task.completed_at))} onOpen={() => openTaskPanel(task.id)} />
              ))}
            </ul>
          )}
        {more > 0 && <p className="px-2 pt-1.5 text-meta text-muted">{t('{n, plural, one {# more task} other {# more tasks}}', { n: more })}</p>}
      </section>
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm -ml-2 gap-1" onClick={() => navigate({ view: 'project', id: block.id })}>
        <Icon name="arrow-right" size="sm" />{t('Open project')}
      </button>
    </div>
  )
}
