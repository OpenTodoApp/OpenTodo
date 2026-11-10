// Settings → Integrations → Assistant → Memory (OpenSpec change assistant-memory,
// "Managing memory"): the facts the assistant keeps to, one line each, edited in
// place. Selecting a fact edits it (Enter saves, Escape cancels); its handle
// moves it, the bin deletes it with Undo; Add takes a new one while fewer than
// 20 are kept, and Clear all asks first. Every change is local first and syncs.
import { useEffect, useRef, useState } from 'react'
import { t } from '../../lib/i18n'
import { addMemory, clearMemory, deleteMemory, editMemory, MAX_MEMORY_ITEMS, MAX_MEMORY_TEXT, MemoryError, moveMemory, useMemoryItems } from '../../lib/memory'
import type { MemoryItem } from '../../lib/types'
import { Button, ConfirmDialog, IconButton, MoveHandle } from '../../ui'
import { reportActionError } from '../actionError'
import { showUndoToast } from '../bulk/toastStore'

export interface MemoryListActions {
  onAdd: (text: string) => Promise<unknown>
  onEdit: (item: MemoryItem, text: string) => Promise<unknown>
  onDelete: (item: MemoryItem) => void
  onMove: (item: MemoryItem, by: -1 | 1) => void
  onClear: () => void
}

/** The one-line input of an add or an edit; Enter commits, Escape cancels. */
function MemoryInput({ initial = '', label, placeholder, onCommit, onCancel }: { initial?: string; label: string; placeholder?: string; onCommit: (text: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  return (
    <input ref={ref} value={value} maxLength={MAX_MEMORY_TEXT} aria-label={label} placeholder={placeholder} data-memory-input
      className="h-8 min-w-0 flex-1 rounded-control border border-input bg-surface px-2 text-body text-default focus-visible:outline-2 focus-visible:outline-focus"
      onChange={(e) => setValue(e.target.value.replace(/[\r\n]+/g, ' '))}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') { e.preventDefault(); if (value.trim()) onCommit(value); else onCancel() }
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }} />
  )
}

function MemoryRow({ item, index, count, actions, onError }: { item: MemoryItem; index: number; count: number; actions: MemoryListActions; onError: (m: string | null) => void }) {
  const [editing, setEditing] = useState(false)
  const textRef = useRef<HTMLButtonElement>(null)
  const back = () => { setEditing(false); requestAnimationFrame(() => textRef.current?.focus()) }
  return (
    <li data-memory-item={item.id} className="group flex min-h-9 items-center gap-2 rounded-control px-2 hover:bg-sunken">
      {editing ? (
        <MemoryInput initial={item.text} label={t('Edit memory')} onCancel={back}
          onCommit={(v) => { void actions.onEdit(item, v).then(() => { onError(null); back() }, (err) => onError(err instanceof MemoryError ? err.message : null)) }} />
      ) : (
        <button ref={textRef} type="button" data-memory-text className="min-w-0 flex-1 rounded-chip py-1 text-left text-body text-default user-text focus-visible:outline-2 focus-visible:outline-focus"
          aria-label={t('Edit “{text}”', { text: item.text })}
          onClick={() => setEditing(true)}
          onKeyDown={(e) => {
            if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); actions.onMove(item, e.key === 'ArrowUp' ? -1 : 1) }
            if (e.key === 'Enter') e.stopPropagation()
          }}>{item.text}</button>
      )}
      {!editing && count > 1 && (
        <MoveHandle label={t('Move {name}', { name: item.text })} first={index === 0} last={index === count - 1} onMove={(by) => actions.onMove(item, by)} className="hover-reveal text-faint" />
      )}
      {!editing && <IconButton icon="trash-2" size="sm" className="hover-reveal text-muted" label={t('Delete “{text}”', { text: item.text })} onClick={() => actions.onDelete(item)} data-memory-delete />}
    </li>
  )
}

/** The list without data access (stories and tests pass items). */
export function MemoryListView({ items, actions, startAdding = false }: { items: readonly MemoryItem[]; actions: MemoryListActions; startAdding?: boolean }) {
  const [adding, setAdding] = useState(startAdding)
  const [error, setError] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const addRef = useRef<HTMLButtonElement>(null)
  const full = items.length >= MAX_MEMORY_ITEMS
  const stopAdding = () => { setAdding(false); requestAnimationFrame(() => addRef.current?.focus()) }
  return (
    <div data-memory-list>
      {items.length > 0 && (
        <ul className="-mx-2 mt-1">
          {items.map((m, i) => <MemoryRow key={m.id} item={m} index={i} count={items.length} actions={actions} onError={setError} />)}
        </ul>
      )}
      {adding && !full ? (
        <div className="mt-1 flex min-h-9 items-center">
          <MemoryInput label={t('Something the assistant should remember')} placeholder={t('Something the assistant should remember')} onCancel={stopAdding}
            onCommit={(v) => { void actions.onAdd(v).then(() => { setError(null); stopAdding() }, (err) => setError(err instanceof MemoryError ? err.message : null)) }} />
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {full
            ? <p className="text-meta text-muted" data-memory-full>{t('Memory holds 20 items. Remove one first.')}</p>
            : <Button ref={addRef} size="sm" variant="ghost" icon="plus" onClick={() => setAdding(true)} data-memory-add>{t('Add')}</Button>}
          {items.length > 0 && <Button size="sm" variant="ghost" className="ml-auto text-muted" onClick={() => setClearing(true)} data-memory-clear>{t('Clear all')}</Button>}
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-meta text-danger">{error}</p>}
      {clearing && (
        <ConfirmDialog title={t('Clear memory?')} confirmLabel={t('Clear all')}
          consequence={t('The assistant forgets every item, on all your devices.')}
          onConfirm={() => { setClearing(false); actions.onClear() }} onCancel={() => setClearing(false)} />
      )}
    </div>
  )
}

const undoable = (p: ReturnType<typeof deleteMemory>) => {
  p.then((entry) => { if (entry) showUndoToast(entry.label ?? t('Memory deleted'), entry.id) }, reportActionError)
}

const actions: MemoryListActions = {
  onAdd: (text) => addMemory(text),
  onEdit: (item, text) => editMemory(item.id, text),
  onDelete: (item) => undoable(deleteMemory(item.id)),
  onMove: (item, by) => { moveMemory(item.id, by).catch(reportActionError) },
  onClear: () => undoable(clearMemory()),
}

/** The card's Memory group with this device's items, live: shown while the assistant is available, or while items are kept. */
export function MemorySettings({ available }: { available: boolean }) {
  const items = useMemoryItems()
  if (!items || (!available && !items.length)) return null
  return (
    <section className="pt-3" aria-labelledby="assistant-memory" data-assistant-card-group="assistant-memory">
      <h3 id="assistant-memory" className="text-meta font-medium uppercase text-muted">{t('Memory')}</h3>
      <MemoryListView items={items} actions={actions} />
    </section>
  )
}
