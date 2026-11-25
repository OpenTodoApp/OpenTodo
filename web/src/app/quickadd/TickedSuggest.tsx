// Ticked items while typing in a reusable list (OpenSpec change reusable-suggest, #1839):
// a listbox under quick add of the list's ticked items whose name contains what is typed,
// the most recently ticked first. Nothing is chosen until an arrow key moves into the
// list, so Enter still adds what was typed; Enter or a click on an item brings it back
// through the list's own add, which reopens it (reusable-lists D3) with its toast and Undo.
// Esc closes the list and keeps the text; it shows only while the field has focus.
// The same list offers a project's open tasks in a next-action field (`kind: 'next'`,
// OpenSpec change choose-next-action, #1950): ↓ in an empty field lists them all, a touch
// screen lists them when the empty field gets focus, each row says what choosing it
// changes, and the field is a combobox with a count of matches at all times.
import { type KeyboardEvent, useEffect, useId, useMemo, useState } from 'react'
import { t } from '../../lib/i18n'
import { touchOnly } from '../../lib/keyboardLikely'
import { TICKED_LIMIT, tickedMatches, type TickedItem } from '../../lib/tickedItems'
import { Icon } from '../../ui'
import { composing } from '../../lib/composeKey'

export function useTickedSuggest<I extends TickedItem>({ items, query, enabled, onPick, kind = 'ticked', hintOf }: {
  items: readonly I[]; query: string; enabled: boolean; onPick: (item: I) => void
  /** `ticked`: a reusable list's ticked items. `next`: a project's open tasks to choose as its next action. */
  kind?: 'ticked' | 'next'
  /** A row's second, faint text: what choosing it changes. */
  hintOf?: (item: I) => string | null
}) {
  const listId = useId()
  const next = kind === 'next'
  const [active, setActive] = useState(-1)
  const [closedFor, setClosedFor] = useState<string | null>(null)
  // ↓ before two letters are typed lists every item (next-action fields only).
  const [browsing, setBrowsing] = useState(false)
  const short = query.trim().length < 2
  const matches = useMemo(() => {
    if (!enabled) return []
    const typed = tickedMatches(items, query)
    return typed.length || !browsing || !short ? typed : items.slice(0, TICKED_LIMIT)
  }, [enabled, items, query, browsing, short])
  const shown = matches.length > 0 && closedFor !== query
  // A new text starts with nothing chosen; an emptied field forgets an Esc.
  useEffect(() => { setActive(-1); if (!query.trim()) setClosedFor(null) }, [query])
  // On a touch screen there is no ↓: the empty field lists its choices as it gets focus, nothing chosen.
  useEffect(() => { setBrowsing(enabled && next && touchOnly() && !query.trim()) }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps -- on focus only

  const pick = (item: I) => { setActive(-1); onPick(item) }

  /** Runs before the field's own key handling; true when the key was the list's. */
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): boolean => {
    if (composing(e)) return false
    if (!shown && next && e.key === 'ArrowDown' && enabled && items.length > 0 && short) {
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
  /**
   * The field's combobox state. A next-action field with choices is a combobox at all
   * times, collapsed while its list is closed; a reusable list's field only while its list shows.
   */
  const aria = next && enabled && items.length > 0
    ? { role: 'combobox' as const, 'aria-autocomplete': 'list' as const, 'aria-haspopup': 'listbox' as const, 'aria-expanded': shown, 'aria-controls': shown ? listId : undefined, 'aria-activedescendant': activeId, 'data-claims-escape': shown ? '' : undefined }
    : shown ? { role: 'combobox' as const, 'aria-autocomplete': 'list' as const, 'aria-expanded': true, 'aria-controls': listId, 'aria-activedescendant': activeId, 'data-claims-escape': '' } : {}

  /** The number of matches for assistive technology (next-action fields). */
  const live = next ? (
    <span role="status" aria-live="polite" className="sr-only" data-next-choices-status>
      {enabled && !short ? (shown ? t('{n, plural, one {# result available} other {# results available}}', { n: matches.length }) : t('No matches')) : ''}
    </span>
  ) : null

  const list = shown ? (
    <ul id={listId} role="listbox" aria-label={next ? t('Open tasks') : t('Completed')} data-ticked-suggestions={kind}
      className="surface-overlay absolute inset-s-0 inset-e-0 top-full z-30 mt-1 max-h-64 overflow-y-auto overscroll-contain p-1 sm:inset-e-auto sm:w-72">
      {matches.map((item, i) => {
        const hint = hintOf?.(item)
        return (
          <li key={item.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
            // Hover only highlights: nothing is chosen for Enter until an arrow key says so.
            className={`flex items-center gap-2 rounded-control px-2 py-1.5 text-body pointer-coarse:min-h-11 hover:bg-sunken dark:hover:bg-raised ${i === active ? 'bg-sunken dark:bg-raised' : ''}`}
            // Keep focus in the field: the pick happens on mouse down.
            onMouseDown={(e) => { e.preventDefault(); pick(item) }} data-ticked-suggestion={item.id}>
            <Icon name={next ? 'circle' : 'rotate-ccw'} size="xs" className="text-faint" />
            <span className="min-w-0 flex-1 truncate" data-suggestion-title>{item.title}</span>
            {hint && <span className="shrink-0 truncate text-meta text-faint" data-suggestion-hint>{hint}</span>}
          </li>
        )
      })}
    </ul>
  ) : null

  return { onKeyDown, list, live, aria, open: shown }
}
