// Ticked items while typing in a reusable list (OpenSpec change reusable-suggest, #1839):
// a listbox under quick add of the list's ticked items whose name contains what is typed,
// the most recently ticked first. Nothing is chosen until an arrow key moves into the
// list, so Enter still adds what was typed; Enter or a click on an item brings it back
// through the list's own add, which reopens it (reusable-lists D3) with its toast and Undo.
// Esc closes the list and keeps the text; it shows only while the field has focus.
// The same list offers a project's open tasks in a next-action field (`kind: 'next'`,
// OpenSpec change choose-next-action, #1950), where ↓ in an empty field lists them all.
import { type KeyboardEvent, useEffect, useId, useMemo, useState } from 'react'
import { t } from '../../lib/i18n'
import { TICKED_LIMIT, tickedMatches, type TickedItem } from '../../lib/tickedItems'
import { Icon } from '../../ui'

export function useTickedSuggest<I extends TickedItem>({ items, query, enabled, onPick, kind = 'ticked' }: {
  items: readonly I[]; query: string; enabled: boolean; onPick: (item: I) => void
  /** `ticked`: a reusable list's ticked items. `next`: a project's open tasks to choose as its next action. */
  kind?: 'ticked' | 'next'
}) {
  const listId = useId()
  const [active, setActive] = useState(-1)
  const [closedFor, setClosedFor] = useState<string | null>(null)
  // ↓ before two letters are typed lists every item (next-action fields only).
  const [browsing, setBrowsing] = useState(false)
  const matches = useMemo(() => {
    if (!enabled) return []
    const typed = tickedMatches(items, query)
    return typed.length || !browsing || query.trim().length >= 2 ? typed : items.slice(0, TICKED_LIMIT)
  }, [enabled, items, query, browsing])
  const shown = matches.length > 0 && closedFor !== query
  // A new text starts with nothing chosen; an emptied field forgets an Esc.
  useEffect(() => { setActive(-1); if (!query.trim()) setClosedFor(null) }, [query])
  useEffect(() => { if (!enabled) setBrowsing(false) }, [enabled])

  const pick = (item: I) => { setActive(-1); onPick(item) }

  /** Runs before the field's own key handling; true when the key was the list's. */
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): boolean => {
    if (!shown && kind === 'next' && e.key === 'ArrowDown' && enabled && items.length > 0 && query.trim().length < 2) {
      e.preventDefault()
      setBrowsing(true)
      setClosedFor(null)
      setActive(0)
      return true
    }
    if (!shown) return false
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % matches.length : i <= 0 ? matches.length - 1 : i - 1))
      return true
    }
    if (e.key === 'Enter' && active >= 0 && !e.shiftKey) {
      e.preventDefault()
      pick(matches[Math.min(active, matches.length - 1)])
      return true
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setClosedFor(query)
      setBrowsing(false)
      return true
    }
    return false
  }

  const activeId = shown && active >= 0 ? `${listId}-${Math.min(active, matches.length - 1)}` : undefined
  /** The field's combobox state while the list shows; nothing otherwise. */
  const aria = shown ? { role: 'combobox' as const, 'aria-autocomplete': 'list' as const, 'aria-expanded': true, 'aria-controls': listId, 'aria-activedescendant': activeId, 'data-claims-escape': '' } : {}

  const list = shown ? (
    <ul id={listId} role="listbox" aria-label={kind === 'next' ? t('Open tasks') : t('Completed')} data-ticked-suggestions={kind}
      className="surface-overlay absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto overscroll-contain p-1 sm:right-auto sm:w-72">
      {matches.map((item, i) => (
        <li key={item.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
          // Hover only highlights: nothing is chosen for Enter until an arrow key says so.
          className={`flex items-center gap-2 rounded-control px-2 py-1.5 text-body pointer-coarse:min-h-11 hover:bg-sunken dark:hover:bg-raised ${i === active ? 'bg-sunken dark:bg-raised' : ''}`}
          // Keep focus in the field: the pick happens on mouse down.
          onMouseDown={(e) => { e.preventDefault(); pick(item) }} data-ticked-suggestion={item.id}>
          <Icon name={kind === 'next' ? 'circle' : 'rotate-ccw'} size="xs" className="text-faint" />
          <span className="min-w-0 flex-1 truncate">{item.title}</span>
        </li>
      ))}
    </ul>
  ) : null

  return { onKeyDown, list, aria, open: shown }
}
