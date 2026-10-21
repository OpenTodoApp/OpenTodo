// Suggestions while typing `#project` or `@label` (OpenSpec change smart-title-tokens,
// natural-language-capture "Token suggestions", design D1): a listbox under the field
// for the token at the caret, filtered on any word of the name, with Create last when
// nothing has exactly that name. Arrows move, Enter or Tab picks, Esc closes and keeps
// the text. Picking inserts a token the parser resolves to exactly that item. The
// field keeps focus throughout (the combobox pattern); the hook hands the field its
// ARIA attributes and a key handler that runs before the field's own.
import { type KeyboardEvent, type RefObject, useId, useMemo, useState } from 'react'
import { createProject } from '../lib/ops'
import { hasExact, insertToken, labelSuggestions, labelToken, projectSuggestions, tokenAtCaret, type TokenAtCaret } from '../lib/nlp/suggest'
import type { LabelRef, ProjectRef } from '../lib/nlp'
import { t } from '../lib/i18n'
import { Icon } from '../ui'

interface Item { key: string; label: string; secondary?: string; color?: string; create?: boolean; run: () => Promise<string> | string }

export interface TokenSuggestOptions {
  input: RefObject<HTMLInputElement | HTMLTextAreaElement | null>
  value: string
  /** Writes a new value (the field's own change handler). */
  setValue: (next: string) => void
  projects: readonly ProjectRef[]
  labels: readonly LabelRef[]
  /** Off with the per-device parsing switch, and for viewers. */
  enabled: boolean
}

export function useTokenSuggest({ input, value, setValue, projects, labels, enabled }: TokenSuggestOptions) {
  const listId = useId()
  const [caret, setCaret] = useState<number | null>(null)
  const [active, setActive] = useState(0)
  // The token start the user closed with Esc: the list stays shut until the caret leaves it.
  const [closedAt, setClosedAt] = useState<number | null>(null)
  const at: TokenAtCaret | null = enabled && caret !== null ? tokenAtCaret(value, caret) : null
  const open = !!at && closedAt !== at.start

  const items = useMemo<Item[]>(() => {
    if (!at) return []
    const q = at.query
    const list: Item[] = at.kind === 'project'
      ? projectSuggestions(q, projects).map((s) => ({ key: s.project.id, label: s.project.name, secondary: s.path.join(' › ') || undefined, run: () => s.token }))
      : labelSuggestions(q, labels).map((s) => ({ key: s.label.id, label: s.label.name, color: s.label.color, run: () => s.token }))
    if (q.trim() && !hasExact(at.kind, q, projects, labels)) {
      const name = q.trim()
      list.push(at.kind === 'project'
        // A project is made now, top-level and personal, through the op log (works offline).
        ? { key: 'create', label: t('Create project “{name}”', { name }), create: true, run: async () => { await createProject({ name }); return `#${name.replace(/\s+/g, '')}` } }
        // A label is made when the task is saved (toTaskInput), as for any @name.
        : { key: 'create', label: t('Create label “{name}”', { name }), create: true, run: () => labelToken({ id: '', name }) })
    }
    return list
  }, [at, projects, labels])

  const track = () => {
    const el = input.current
    setCaret(el ? el.selectionStart : null)
  }

  const pick = async (item: Item) => {
    if (!at) return
    const token = await item.run()
    const next = insertToken(value, at, token)
    setValue(next.value)
    setActive(0)
    requestAnimationFrame(() => {
      const el = input.current
      if (!el) return
      el.focus()
      el.setSelectionRange(next.caret, next.caret)
      setCaret(next.caret)
    })
  }

  /** Runs before the field's own key handling; true when the key was the list's. */
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): boolean => {
    if (!open || !items.length) return false
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length)
      return true
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      void pick(items[Math.min(active, items.length - 1)])
      return true
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setClosedAt(at!.start)
      return true
    }
    return false
  }

  /** Opens the list for the token at `end` (an unmatched chip asks for it). */
  const openAt = (end: number) => {
    setClosedAt(null)
    requestAnimationFrame(() => {
      const el = input.current
      if (!el) return
      el.focus()
      el.setSelectionRange(end, end)
      setCaret(end)
    })
  }

  const shown = open && items.length > 0
  const activeId = shown ? `${listId}-${Math.min(active, items.length - 1)}` : undefined
  const fieldProps = {
    role: 'combobox' as const,
    'aria-autocomplete': 'list' as const,
    'aria-expanded': shown,
    'aria-controls': shown ? listId : undefined,
    'aria-activedescendant': activeId,
    // The caret moves with typing (input), keys, clicks and selection.
    onInput: track,
    onSelect: track,
    onKeyUp: track,
    onClick: track,
    onFocus: track,
    onBlur: () => setCaret(null),
  }

  const list = shown ? (
    <ul id={listId} role="listbox" aria-label={at!.kind === 'project' ? t('Projects') : t('Labels')} data-token-suggestions={at!.kind}
      className="surface-overlay absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto overscroll-contain p-1 sm:right-auto sm:w-72">
      {items.map((item, i) => (
        <li key={item.key} id={`${listId}-${i}`} role="option" aria-selected={i === Math.min(active, items.length - 1)}
          className={`flex cursor-pointer items-center gap-2 rounded-control px-2 py-1.5 text-body ${i === Math.min(active, items.length - 1) ? 'bg-sunken dark:bg-raised' : ''}`}
          // Keep focus in the field: the pick happens on mouse down.
          onMouseDown={(e) => { e.preventDefault(); void pick(item) }} onMouseEnter={() => setActive(i)} data-suggestion={item.create ? 'create' : item.key}>
          {item.create
            ? <Icon name="plus" size="xs" className="text-faint" />
            : at!.kind === 'project'
              ? <Icon name="folder" size="xs" className="text-faint" />
              : <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color ?? 'var(--ot-faint)' }} />}
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.secondary && <span className="shrink-0 truncate text-meta text-faint">{item.secondary}</span>}
        </li>
      ))}
    </ul>
  ) : null

  return { fieldProps, onKeyDown, list, openAt, open: shown }
}
