// Board view of a project (OpenSpec `board-view`): one column per section, preceded
// by "No section", each listing its open top-level tasks by position. A pure
// rendering of the same local query as the list (design D5); the parent view owns
// selection and keyboard handling. Columns are drop targets for lib/dnd.
import { Button, useWide } from '../ui'
import type { ReactNode } from 'react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { Label, Project, Section, Task } from '../lib/types'
import { AddSection, SectionHeader, SectionMark, SectionQuickAdd } from './Sections'
import { t } from '../lib/i18n'
import { isGhost } from './motion'

export interface BoardColumn {
  /** Section id, or '' for "No section". */
  key: string
  section: Section | null
  cards: Task[]
  /** Folded to a strip on this device (board-polish D1): the section is collapsed. */
  folded?: boolean
}

/** The drop target key of a section ('' = "No section"); shared with the list headings. */
export const sectionTarget = (key: string) => `section:${key}`

// A folded column's button (board-polish D2): loaded with the first fold, the strip around it is drawn here.
const FoldedStrip = lazy(() => import('./FoldedStrip'))

/** The gap between columns (gap-3) in px, for the phone's current column. */
const GAP = 12
/** A folded strip's width below 640 px (board-polish D2). */
const STRIP = 48

/** The column whose start is nearest the scroll position, among the unfolded ones (board-polish D9). */
function nearestColumn(el: HTMLElement): number {
  const cols = [...el.querySelectorAll<HTMLElement>('[data-column]')]
  const unit = cols.find((c) => !c.hasAttribute('data-folded'))?.offsetWidth ?? 0
  let x = 0, best = 0, bestDist = Infinity, n = 0
  for (const c of cols) {
    const folded = c.hasAttribute('data-folded')
    if (!folded) {
      const d = Math.abs(x - el.scrollLeft)
      if (d < bestDist) { bestDist = d; best = n }
      n++
    }
    x += (c.offsetWidth || (folded ? STRIP : unit)) + GAP
  }
  return best
}

export function BoardView({ project, columns, editable, addingTo, setAddingTo, projects, labels, renderCard, onCurrentColumn, placeholder = null, onFold, announcement = '' }: {
  project: Project
  columns: BoardColumn[]
  editable: boolean
  /** Column whose quick add is open (section key), or null. */
  addingTo: string | null
  setAddingTo: (key: string | null) => void
  projects: Project[]
  labels: Label[]
  renderCard: (task: Task) => ReactNode
  /** Below 640 px: the name of the column in view, for the page bar (sections-and-boards "Board on a phone"). */
  onCurrentColumn?: (name: string | null) => void
  /** While a card is dragged over a column: that column and the card's height (surfaces-v2 D7). */
  placeholder?: { key: string; height: number } | null
  /** Fold or unfold a column on this device (board-polish D1); absent: columns do not fold. */
  onFold?: (key: string, folded: boolean) => void
  /** A polite announcement, such as "Moved to Done" after a keyboard move into a folded column (D3). */
  announcement?: string
}) {
  const sections = columns.filter((c) => c.section)
  const nameOf = (col: BoardColumn) => (col.section ? col.section.name || t('Untitled section') : t('No section'))
  // The pager and the page bar know only unfolded columns (D9).
  const open = columns.filter((c) => !c.folded)
  const names = open.map(nameOf)
  // Phones (below 640 px): columns are 88 % of the screen with snapping; a dot pager
  // follows the scroll position and the current column's name goes to the page bar.
  const wide = useWide()
  const scroller = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(0)
  // Folding the last columns leaves fewer dots: keep the current one among them.
  useEffect(() => { if (current > 0 && current >= open.length) setCurrent(Math.max(0, open.length - 1)) }, [current, open.length])
  const onScroll = () => {
    const el = scroller.current
    if (el) setCurrent(Math.min(open.length - 1, nearestColumn(el)))
  }
  useEffect(() => {
    if (wide || !onCurrentColumn) return
    onCurrentColumn(names[current] ?? null)
    return () => onCurrentColumn(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- names is keyed by its content; onCurrentColumn is an inline parent callback
  }, [wide, current, names.join('\u0000')])
  const goTo = (i: number) => scroller.current?.querySelectorAll<HTMLElement>('[data-column]:not([data-folded])')[i]?.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'smooth' })
  // Unfolding from the strip brings the column into view (a tap on a phone, D9).
  const unfold = (key: string) => {
    onFold?.(key, false)
    requestAnimationFrame(() => scroller.current?.querySelector<HTMLElement>(`[data-column="${CSS.escape(key)}"]`)?.scrollIntoView?.({ inline: 'nearest', block: 'nearest', behavior: 'smooth' }))
  }
  return (
    <>
    <span className="sr-only" aria-live="polite" data-board-announce>{announcement}</span>
    {!wide && open.length > 1 && (
      <div className="mb-2 flex items-center justify-center gap-2" data-board-pager>
        <span className="sr-only" aria-live="polite">{t('Column {n} of {count}: {name}', { n: current + 1, count: open.length, name: names[current] })}</span>
        {open.map((col, i) => (
          <button key={col.key || 'none'} type="button" onClick={() => goTo(i)} aria-label={t('{name}, column {n} of {count}', { name: names[i], n: i + 1, count: open.length })} aria-current={i === current ? 'true' : undefined}
            className="touch-target flex items-center justify-center" data-board-dot={i === current ? 'current' : ''}>
            <span aria-hidden="true" className={`block h-2 w-2 rounded-full ${i === current ? 'bg-accent' : 'bg-faint'}`} />
          </button>
        ))}
      </div>
    )}
    {/* Columns stretch to the board's height, so every band runs to the bottom (precision-boards-timeline D1). */}
    <div ref={scroller} onScroll={wide ? undefined : onScroll} className="-mx-4 flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto px-4 pb-6 md:mx-0 md:snap-none md:px-0" data-board data-scroll-x>
      {columns.map((col) => {
        const idx = sections.findIndex((c) => c.key === col.key)
        const name = nameOf(col)
        // A departing card (motion-v2 D2) is still shown but no longer counted.
        const open = col.cards.reduce((n, c) => n + (isGhost(c) ? 0 : 1), 0)
        if (col.folded) return <FoldedColumn key={col.key || 'none'} col={col} name={name} open={open} over={placeholder?.key === col.key} onUnfold={() => unfold(col.key)} />
        return (
          <section
            key={col.key || 'none'}
            data-drop-target={sectionTarget(col.key)}
            data-column={col.key}
            aria-label={t('{name}, {n, plural, one {# open task} other {# open tasks}}', { name, n: open })}
            className="ui-column flex h-[calc(100dvh-14rem)] w-[88vw] shrink-0 snap-start flex-col sm:w-72 sm:max-w-72"
          >
            <SectionHeader
              section={col.section}
              count={open}
              layout="board"
              editable={editable}
              first={idx <= 0}
              last={idx === sections.length - 1}
              onAdd={() => setAddingTo(col.key)}
              onFold={onFold ? () => onFold(col.key, true) : undefined}
            />
            {/* Cards lift on hover and focus; the dragged one fades while its placeholder shows where it lands. */}
            <ul className="ui-cards--lift min-h-0 space-y-1.5 overflow-y-auto px-0.5 pb-1">
              {col.cards.map((tk) => renderCard(tk))}
              {placeholder?.key === col.key && <li aria-hidden data-drop-placeholder className="ui-drop-placeholder" style={{ height: placeholder.height }} />}
            </ul>
            {/* "Add a task" ends every column's cards (D2); the header's plus opens the same field. */}
            {editable && addingTo !== col.key && (
              <Button variant="ghost" size="sm" icon="plus" className="w-full justify-start text-muted" data-column-add={col.key} onClick={() => setAddingTo(col.key)}>
                {t('Add a task')}
              </Button>
            )}
            {addingTo === col.key && editable && (
              <SectionQuickAdd project={project} sectionId={col.key || null} sectionName={name} projects={projects} labels={labels} onClose={() => setAddingTo(null)} />
            )}
          </section>
        )
      })}
      {editable && <AddSection projectId={project.id} layout="board" />}
    </div>
    </>
  )
}

/**
 * A folded column (board-polish D2, D3): a strip of the column surface with the
 * section's mark, the open-task count and the name written vertically. The whole
 * strip is one button that unfolds it; it stays a drop target for cards.
 */
function FoldedColumn({ col, name, open, over, onUnfold }: { col: BoardColumn; name: string; open: number; over: boolean; onUnfold: () => void }) {
  const label = t('{name}, {n, plural, one {# open task} other {# open tasks}}, folded', { name, n: open })
  return (
    <section data-drop-target={sectionTarget(col.key)} data-column={col.key} data-folded="" data-drop-over={over || undefined} className="ui-column-strip">
      <Suspense fallback={null}>
        <FoldedStrip id={col.key} name={name} label={label} count={open} mark={col.section && <SectionMark section={col.section} />} onUnfold={onUnfold} />
      </Suspense>
    </section>
  )
}
