// Board view of a project (OpenSpec `board-view`): one column per section, preceded
// by "No section", each listing its open top-level tasks by position. A pure
// rendering of the same local query as the list (design D5); the parent view owns
// selection and keyboard handling. Columns are drop targets for lib/dnd.
import { Button, useWide } from '../ui'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { Label, Project, Section, Task } from '../lib/types'
import { AddSection, SectionHeader, SectionQuickAdd } from './Sections'
import { t } from '../lib/i18n'

export interface BoardColumn {
  /** Section id, or '' for "No section". */
  key: string
  section: Section | null
  cards: Task[]
}

/** The drop target key of a section ('' = "No section"); shared with the list headings. */
export const sectionTarget = (key: string) => `section:${key}`

export function BoardView({ project, columns, editable, addingTo, setAddingTo, projects, labels, renderCard, onCurrentColumn, placeholder = null }: {
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
}) {
  const sections = columns.filter((c) => c.section)
  const names = columns.map((col) => (col.section ? col.section.name || t('Untitled section') : t('No section')))
  // Phones (below 640 px): columns are 88 % of the screen with snapping; a dot pager
  // follows the scroll position and the current column's name goes to the page bar.
  const wide = useWide()
  const scroller = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(0)
  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    const first = el.querySelector<HTMLElement>('[data-column]')
    if (!first) return
    const step = first.offsetWidth + 12
    setCurrent(Math.max(0, Math.min(columns.length - 1, Math.round(el.scrollLeft / step))))
  }
  useEffect(() => {
    if (wide || !onCurrentColumn) return
    onCurrentColumn(names[current] ?? null)
    return () => onCurrentColumn(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- names is keyed by its content; onCurrentColumn is an inline parent callback
  }, [wide, current, names.join('\u0000')])
  const goTo = (i: number) => scroller.current?.querySelectorAll<HTMLElement>('[data-column]')[i]?.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'smooth' })
  return (
    <>
    {!wide && columns.length > 1 && (
      <div className="mb-2 flex items-center justify-center gap-2" data-board-pager>
        <span className="sr-only" aria-live="polite">{t('Column {n} of {count}: {name}', { n: current + 1, count: columns.length, name: names[current] })}</span>
        {columns.map((col, i) => (
          <button key={col.key || 'none'} type="button" onClick={() => goTo(i)} aria-label={t('{name}, column {n} of {count}', { name: names[i], n: i + 1, count: columns.length })} aria-current={i === current ? 'true' : undefined}
            className="touch-target flex items-center justify-center" data-board-dot={i === current ? 'current' : ''}>
            <span aria-hidden="true" className={`block h-2 w-2 rounded-full ${i === current ? 'bg-accent' : 'bg-faint'}`} />
          </button>
        ))}
      </div>
    )}
    <div ref={scroller} onScroll={wide ? undefined : onScroll} className="-mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-6 md:mx-0 md:snap-none md:px-0" data-board data-scroll-x>
      {columns.map((col) => {
        const idx = sections.findIndex((c) => c.key === col.key)
        const name = col.section ? col.section.name || t('Untitled section') : t('No section')
        return (
          <section
            key={col.key || 'none'}
            data-drop-target={sectionTarget(col.key)}
            data-column={col.key}
            aria-label={t('{name}, {n, plural, one {# open task} other {# open tasks}}', { name, n: col.cards.length })}
            className="ui-column flex max-h-[calc(100dvh-14rem)] w-[88vw] shrink-0 snap-start flex-col sm:w-72 sm:max-w-72"
          >
            <SectionHeader
              section={col.section}
              count={col.cards.length}
              layout="board"
              editable={editable}
              first={idx <= 0}
              last={idx === sections.length - 1}
              onAdd={() => setAddingTo(col.key)}
            />
            {/* Cards lift on hover and focus; the dragged one fades while its placeholder shows where it lands. */}
            <ul className="ui-cards--lift min-h-8 space-y-1.5 overflow-y-auto px-0.5 pb-1">
              {col.cards.map((tk) => renderCard(tk))}
              {placeholder?.key === col.key && <li aria-hidden data-drop-placeholder className="ui-drop-placeholder" style={{ height: placeholder.height }} />}
            </ul>
            {editable && col.cards.length === 0 && addingTo !== col.key && (
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
