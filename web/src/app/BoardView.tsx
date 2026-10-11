// Board view of a project (OpenSpec `board-view`): one column per section, preceded
// by "No section", each listing its open top-level tasks by position. A pure
// rendering of the same local query as the list (design D5); the parent view owns
// selection and keyboard handling. Columns are drop targets for lib/dnd.
import type { ReactNode } from 'react'
import type { Label, Project, Section, Task } from '../lib/types'
import { AddSection, SectionHeader, SectionQuickAdd } from './Sections'

export interface BoardColumn {
  /** Section id, or '' for "No section". */
  key: string
  section: Section | null
  cards: Task[]
}

/** The drop target key of a section ('' = "No section"); shared with the list headings. */
export const sectionTarget = (key: string) => `section:${key}`

export function BoardView({ project, columns, editable, addingTo, setAddingTo, projects, labels, renderCard }: {
  project: Project
  columns: BoardColumn[]
  editable: boolean
  /** Column whose quick add is open (section key), or null. */
  addingTo: string | null
  setAddingTo: (key: string | null) => void
  projects: Project[]
  labels: Label[]
  renderCard: (task: Task) => ReactNode
}) {
  const sections = columns.filter((c) => c.section)
  return (
    <div className="-mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-6 md:mx-0 md:snap-none md:px-0" data-board data-scroll-x>
      {columns.map((col) => {
        const idx = sections.findIndex((c) => c.key === col.key)
        const name = col.section ? col.section.name || 'Untitled section' : 'No section'
        return (
          <section
            key={col.key || 'none'}
            data-drop-target={sectionTarget(col.key)}
            data-column={col.key}
            aria-label={`${name}, ${col.cards.length} open ${col.cards.length === 1 ? 'task' : 'tasks'}`}
            className="flex max-h-[calc(100dvh-14rem)] w-[85vw] max-w-72 shrink-0 snap-start flex-col rounded-lg bg-slate-50 p-1.5 data-drop-active:ring-2 data-drop-active:ring-emerald-500 sm:w-72 dark:bg-slate-900"
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
            <ul className="min-h-8 space-y-1.5 overflow-y-auto px-0.5 pb-1">
              {col.cards.map((t) => renderCard(t))}
            </ul>
            {addingTo === col.key && editable && (
              <SectionQuickAdd project={project} sectionId={col.key || null} sectionName={name} projects={projects} labels={labels} onClose={() => setAddingTo(null)} />
            )}
          </section>
        )
      })}
      {editable && <AddSection projectId={project.id} layout="board" />}
    </div>
  )
}
