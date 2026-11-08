// The rotation editor (OpenSpec change chore-rotation, design D5), inside the
// Assignee popover: the people who take turns in order, reordered by dragging a
// handle (pointer or touch) or with Alt+Up/Alt+Down on it, filled from the
// project's members with the people picker and from "Add everyone in <group>",
// and cleared with "Stop taking turns". Every change writes the whole list as one
// operation, so it works offline and converges like any field.
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useMembershipMap, useWorkspaceGroups } from '../../lib/localData'
import { updateTask } from '../../lib/ops'
import { addToRotation, MAX_ROTATION, moveInRotation } from '../../lib/rotation'
import type { Task } from '../../lib/types'
import { Button, ComboboxPanel, IconButton, MoveHandle } from '../../ui'
import { PersonAvatar } from '../PersonAvatar'
import { act } from '../actionError'
import { t } from '../../lib/i18n'

interface Person { id: string; name: string; email: string }

export default function RotationEditor({ task, userId, onBack }: { task: Task; userId?: string; onBack: () => void }) {
  const memberships = useMembershipMap()
  const groups = useWorkspaceGroups()
  const m = task.project_id ? memberships.get(task.project_id) : undefined
  const stored = useMemo(() => task.rotation ?? [], [task.rotation])
  // The list as last written here, so quick changes build on each other before the
  // live row catches up; a change from elsewhere replaces it.
  const storedKey = stored.join('\n')
  const [seen, setSeen] = useState(storedKey)
  const [local, setLocal] = useState<string[]>(stored)
  if (seen !== storedKey) {
    setSeen(storedKey)
    setLocal(stored)
  }
  // While a handle is dragged, the order shown before it is written.
  const [draft, setDraft] = useState<string[] | null>(null)
  const list = draft ?? local
  const [announce, setAnnounce] = useState('')
  const rows = useRef<(HTMLLIElement | null)[]>([])
  const drag = useRef<{ id: string; from: number } | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)

  const people = useMemo<Person[]>(() => (m?.members ?? []).map((p) => ({
    id: p.userId, name: p.userId === userId ? t('You') : p.name || p.email, email: p.userId === userId ? '' : p.email,
  })), [m, userId])
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? t('left the project')
  // The workspace groups that give someone a role on this project, each with its members here.
  const projectGroups = useMemo(() => {
    const here = new Set(people.map((p) => p.id))
    const ids = [...new Set((m?.members ?? []).flatMap((p) => (p.via ?? []).map((v) => v.id)))]
    return ids.map((id) => groups.find((g) => g.id === id)).filter((g) => !!g)
      .map((g) => ({ id: g.id, name: g.name, members: g.members.filter((u) => here.has(u)) }))
      .filter((g) => g.members.length > 0)
  }, [m, groups, people])

  const save = (next: string[]) => {
    setLocal(next)
    act(updateTask(task.id, { rotation: next }))
  }
  const move = (id: string, delta: number) => {
    const from = list.indexOf(id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= list.length) return
    save(moveInRotation(list, from, to))
    setAnnounce(t('{name} moved to position {n} of {count}', { name: nameOf(id), n: to + 1, count: list.length }))
    requestAnimationFrame(() => rows.current[to]?.querySelector<HTMLButtonElement>('[data-rotation-handle]')?.focus())
  }
  const onKey = (e: KeyboardEvent, id: string) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    move(id, e.key === 'ArrowUp' ? -1 : 1)
  }
  // Pointer drag on the handle (mouse, pen and touch): the row under the pointer takes the dragged person.
  const onDown = (e: PointerEvent<HTMLButtonElement>, id: string) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drag.current = { id, from: list.indexOf(id) }
    setDragging(id)
    setDraft(list)
  }
  const onMove = (e: PointerEvent) => {
    const d = drag.current
    if (!d || !draft) return
    const at = rows.current.findIndex((el) => { const r = el?.getBoundingClientRect(); return !!r && e.clientY >= r.top && e.clientY < r.bottom })
    const from = draft.indexOf(d.id)
    if (at >= 0 && at !== from) setDraft(moveInRotation(draft, from, at))
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (d && draft && draft.indexOf(d.id) !== d.from) {
      save(draft)
      setAnnounce(t('{name} moved to position {n} of {count}', { name: nameOf(d.id), n: draft.indexOf(d.id) + 1, count: draft.length }))
    }
    setDraft(null)
    setDragging(null)
  }
  // The members not taking turns yet: the people picker offers them.
  const rest = people.filter((p) => !list.includes(p.id))

  return (
    <div className="space-y-3" data-rotation-editor>
      <p className="text-meta text-muted">{t('Completing the task assigns it to the next person in this order.')}</p>
      {list.length > 0 && (
        <ol aria-label={t('Turn order')} className="divide-y divide-default rounded-card border border-default" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {list.map((id, i) => {
            const name = nameOf(id)
            const gone = !people.some((p) => p.id === id)
            const now = id === task.assignee_id
            return (
              <li key={id} ref={(el) => { rows.current[i] = el }} data-rotation-row={id}
                className={`flex min-h-11 items-center gap-2 px-1.5 py-1 ${dragging === id ? 'bg-sunken dark:bg-raised' : ''}`}>
                {/* Drag it, or click it for Move up and Move down (accessibility-aa D3, WCAG 2.5.7). */}
                <MoveHandle data-rotation-handle data-drag-id="rotation-member" label={t('Move {name} (Alt+Up or Alt+Down)', { name })}
                  first={i === 0} last={i === list.length - 1} onMove={(delta) => move(id, delta)}
                  onKeyDown={(e) => onKey(e, id)} onPointerDown={(e) => onDown(e, id)} />
                <span className="w-4 shrink-0 text-right text-meta text-faint tabular-nums" aria-hidden="true">{i + 1}</span>
                <PersonAvatar id={id} name={name} size="xs" />
                <span className={`min-w-0 flex-1 truncate text-body ${gone ? 'italic text-faint' : 'text-default'} ${now ? 'font-semibold' : ''}`}>
                  {name}{now && <span className="ml-1.5 text-meta font-normal text-muted">{t('(now)')}</span>}
                </span>
                <IconButton icon="x" size="sm" label={t('Remove {name}', { name })} onClick={() => save(list.filter((x) => x !== id))} />
              </li>
            )
          })}
        </ol>
      )}
      <span role="status" aria-live="polite" className="sr-only">{announce}</span>
      {rest.length > 0 && list.length < MAX_ROTATION ? (
        <ComboboxPanel<Person> label={t('Add person')} placeholder={t('Add person…')} source={rest}
          getKey={(p) => p.id} getLabel={(p) => p.name} getSecondary={(p) => p.email || undefined} rankContext={`assignee:${task.project_id ?? 'personal'}`}
          emptyText={t('No member matches.')} renderLeading={(p) => <PersonAvatar id={p.id} name={p.name} size="sm" />} onPick={(p) => save(addToRotation(list, [p.id]))} />
      ) : rest.length === 0 && <p className="text-meta text-muted">{t('Everyone in the project takes turns.')}</p>}
      {list.length >= MAX_ROTATION && <p className="text-meta text-muted">{t('At most {n} people take turns.', { n: MAX_ROTATION })}</p>}
      {projectGroups.length > 0 && (
        <div className="flex flex-col items-start gap-1">
          {projectGroups.map((g) => (
            <Button key={g.id} variant="ghost" size="sm" icon="users" data-rotation-group={g.id}
              disabled={g.members.every((u) => list.includes(u))} onClick={() => save(addToRotation(list, g.members))}>
              {t('Add everyone in {group}', { group: g.name })}
            </Button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-default pt-2">
        <Button variant="ghost" size="sm" icon="arrow-left" onClick={onBack}>{t('Assignee')}</Button>
        {list.length > 0 && <Button variant="ghost" size="sm" onClick={() => save([])} data-rotation-stop>{t('Stop taking turns')}</Button>}
      </div>
    </div>
  )
}
