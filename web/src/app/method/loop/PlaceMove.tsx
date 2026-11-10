// The Place move in place (loop-guided-dashboard D4): every working project without
// a next action, each with a field that adds one, then the stalled projects and the
// review's project walk.
import { useRef, useState, type FormEvent } from 'react'
import { t } from '../../../lib/i18n'
import { createTask } from '../../../lib/ops'
import type { Project } from '../../../lib/types'
import { Button, CatalogueIcon, Icon, Input, isCatalogueIcon } from '../../../ui'
import { act } from '../../actionError'
import { navigate, routePath } from '../../router'
import type { MoveProps } from '../LoopHome'
import { GroupHeading } from './rows'

/**
 * The project's mark, as the sidebar's ProjectMark draws it. Kept here because
 * importing the sidebar module from this lazy chunk splits the first load's chunks
 * (bundle-budget), and moving the mark out of it does too.
 */
function ProjectMark({ project }: { project: Project }) {
  const dot = <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
  if (!project.icon || !isCatalogueIcon(project.icon)) return dot
  return <span style={{ color: project.color }} className="flex items-center"><CatalogueIcon name={project.icon} size="sm" fallback={dot} /></span>
}

function ProjectLink({ project }: { project: Project }) {
  const route = { view: 'project', id: project.id } as const
  return (
    <a href={routePath(route)} onClick={(e) => { if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); navigate(route) }}
      className="flex min-w-0 items-center gap-2 rounded-chip text-body text-default outline-none hover:text-strong focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-focus">
      <ProjectMark project={project} /><span className="user-text truncate">{project.name}</span>
    </a>
  )
}

function AddNext({ project, onAdded }: { project: Project; onAdded: () => void }) {
  const [title, setTitle] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const text = title.trim()
    if (!text) return
    setTitle('')
    await act(createTask({ title: text, project_id: project.id }))
    onAdded()
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="min-w-0 flex-1">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('What is the next step?')}
        aria-label={t('Next action for {name}', { name: project.name })} enterKeyHint="done" data-loop-add-next={project.id} />
    </form>
  )
}

export default function PlaceMove({ data }: MoveProps) {
  const list = useRef<HTMLUListElement>(null)
  // The project leaves the list once it has a next action: the next field takes the focus.
  const focusNext = (index: number) => requestAnimationFrame(() => {
    const fields = list.current?.querySelectorAll<HTMLInputElement>('[data-loop-add-next]')
    fields?.[Math.min(index, fields.length - 1)]?.focus()
  })
  const stalled = data.stalled.filter((p) => !data.withoutNext.includes(p))
  return (
    <div data-loop-part="place">
      {data.withoutNext.length === 0 ? (
        <p className="flex items-center gap-2 px-2 py-1 text-body text-muted" data-loop-place-done>
          <Icon name="circle-check-big" className="shrink-0 text-success" />{t('{n, plural, =0 {Every project has a next action} one {# project without a next action} other {# projects without a next action}}', { n: 0 })}
        </p>
      ) : (
        <ul ref={list} className="flex flex-col gap-1" data-loop-without-next>
          {data.withoutNext.map((p, i) => (
            <li key={p.id} className="flex flex-col gap-1.5 rounded-card px-2 py-1.5 sm:flex-row sm:items-center sm:gap-4" data-loop-project={p.id}>
              <span className="min-w-0 sm:w-56 sm:shrink-0"><ProjectLink project={p} /></span>
              <AddNext project={p} onAdded={() => focusNext(i)} />
            </li>
          ))}
        </ul>
      )}
      {stalled.length > 0 && (
        <section className="mt-6" aria-labelledby="loop-stalled" data-loop-stalled>
          <GroupHeading id="loop-stalled">{t('Stalled')}</GroupHeading>
          <ul className="flex flex-col gap-1">
            {stalled.map((p) => <li key={p.id} className="px-2 py-1.5"><ProjectLink project={p} /></li>)}
          </ul>
        </section>
      )}
      <Button size="sm" variant="ghost" iconEnd="arrow-right" className="mt-3" onClick={() => navigate({ view: 'review', step: 'projects' })}>{t('Walk your projects')}</Button>
    </div>
  )
}
