// Suggestions while typing `#project` or `@label` (OpenSpec change smart-title-tokens,
// natural-language-capture "Token suggestions", design D1): a listbox under the field
// for the token at the caret, filtered on any word of the name, with Create last when
// nothing has exactly that name. Arrows move, Enter or Tab picks, Esc closes and keeps
// the text. Picking inserts a token the parser resolves to exactly that item. The
// field keeps focus throughout (the combobox pattern); the hook hands the field its
// ARIA attributes and a key handler that runs before the field's own.
import { type KeyboardEvent, type RefObject, useEffect, useId, useMemo, useState } from 'react'
import { createProject } from '../lib/ops'
import { energySuggestions, hasExact, insertToken, labelSuggestions, labelToken, PRIORITY_SUGGESTIONS, projectSuggestions, tokenAtCaret, type TokenAtCaret } from '../lib/nlp/suggest'
import { priorityName } from '../lib/priority'
import type { LabelRef, ProjectRef } from '../lib/nlp'
import { t } from '../lib/i18n'
import { energyName } from '../lib/energy'
import { hueFor, Icon } from '../ui'
import { useTickedItems, type TickedItem } from '../lib/tickedItems'
import type { NextChoice } from '../lib/method/rules'
import { useTickedSuggest } from './quickadd/TickedSuggest'
import { choiceHint } from './method/chooseNext'
import { composing } from '../lib/composeKey'

interface Item { key: string; label: string; secondary?: string; color?: string; level?: number; create?: boolean; run: () => Promise<string> | string }

/** The level's ring in the suggestion list, like the quick-add Priority row: the p1–p4 tokens. */
const PRIORITY_RING: Record<number, string> = { 1: 'border-p1', 2: 'border-p2', 3: 'border-p3', 4: 'border-p4' }

export interface TokenSuggestOptions {
  input: RefObject<HTMLInputElement | HTMLTextAreaElement | null>
  value: string
  /** Writes a new value (the field's own change handler). */
  setValue: (next: string) => void
  projects: readonly ProjectRef[]
  labels: readonly LabelRef[]
  /** Off with the per-device parsing switch, and for viewers. */
  enabled: boolean
  /** The account offers energy (task-energy D3): `~` suggests the three levels. */
  energy?: boolean
  /** A reusable list: its ticked items are suggested by name while no token is (reusable-suggest, #1839). */
  reuseProjectId?: string | null
  /** The typed name without its tokens, matched against the ticked items. */
  tickedQuery?: string
  /** Adds a ticked item by its exact name, which reopens it. */
  onTicked?: (title: string) => void
  /** A project's open tasks to choose as its next action, suggested in place of ticked items (choose-next-action). */
  choices?: { items: readonly NextChoice[]; onPick: (choice: NextChoice) => void }
}

export function useTokenSuggest({ input, value, setValue, projects, labels, enabled, energy = false, reuseProjectId, tickedQuery, onTicked, choices }: TokenSuggestOptions) {
  const listId = useId()
  const [caret, setCaret] = useState<number | null>(null)
  const [active, setActive] = useState(0)
  // The token start the user closed with Esc: the list stays shut until the caret leaves it.
  const [closedAt, setClosedAt] = useState<number | null>(null)
  const at: TokenAtCaret | null = enabled && caret !== null ? tokenAtCaret(value, caret, { energy }) : null
  const open = !!at && closedAt !== at.start
  // Only while the field has focus (caret), and no query at all until two characters are typed.
  const typed = (tickedQuery ?? value).trim().length >= 2
  const tickedItems = useTickedItems(typed && !choices ? reuseProjectId : null)
  const ticked = useTickedSuggest<TickedItem | NextChoice>(choices
    ? { kind: 'next', items: choices.items, query: tickedQuery ?? value, enabled: !open && caret !== null, onPick: (item) => choices.onPick(item as NextChoice), hintOf: (item) => choiceHint(item as NextChoice) }
    : { items: tickedItems, query: tickedQuery ?? value, enabled: !open && !!onTicked && caret !== null, onPick: (item) => onTicked?.(item.title) })

  const items = useMemo<Item[]>(() => {
    if (!at) return []
    const q = at.query
    // `~` offers the three levels and never a Create entry (task-energy D4).
    if (at.kind === 'energy') return energySuggestions(q).map((s) => ({ key: s.level, label: energyName(s.level), run: () => s.token }))
    // `p` lists the levels as "p1 · Must" (priority-names D4); never a Create entry.
    if (at.kind === 'priority') return PRIORITY_SUGGESTIONS.map((s) => ({ key: s.token, label: `${s.token} · ${priorityName(s.level)}`, level: s.level, run: () => s.token }))
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
  // A next-action field focused as it mounts (the walk's dialog) offers its choices before any event.
  // Only there: any other field would open a token's list on a prefilled line (the palette, the sheet).
  useEffect(() => { if (choices && input.current && input.current === document.activeElement) track() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- on mount only

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
    if (composing(e)) return false
    if (!open || !items.length) return ticked.onKeyDown(e)
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
    'data-claims-escape': shown ? '' : undefined, // Esc closes the list, not the sheet around it
    // The caret moves with typing (input), keys, clicks and selection.
    onInput: track,
    onSelect: track,
    onKeyUp: track,
    onClick: track,
    onFocus: track,
    onBlur: () => setCaret(null),
    ...ticked.aria,
  }

  const list = shown ? (
    <ul id={listId} role="listbox" aria-label={at!.kind === 'project' ? t('Projects') : at!.kind === 'energy' ? t('Energy') : at!.kind === 'priority' ? t('Priority') : t('Labels')} data-token-suggestions={at!.kind}
      className="surface-overlay absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto overscroll-contain p-1 sm:right-auto sm:w-72">
      {items.map((item, i) => (
        <li key={item.key} id={`${listId}-${i}`} role="option" aria-selected={i === Math.min(active, items.length - 1)}
          className={`flex items-center gap-2 rounded-control px-2 py-1.5 text-body pointer-coarse:min-h-11 ${i === Math.min(active, items.length - 1) ? 'bg-sunken dark:bg-raised' : ''}`}
          // Keep focus in the field: the pick happens on mouse down.
          onMouseDown={(e) => { e.preventDefault(); void pick(item) }} onMouseEnter={() => setActive(i)} data-suggestion={item.create ? 'create' : item.key}>
          {item.create
            ? <Icon name="plus" size="xs" className="text-faint" />
            : at!.kind === 'project'
              ? <Icon name="folder" size="xs" className="text-faint" />
              : at!.kind === 'energy'
              ? <Icon name="zap" size="xs" className="text-faint" />
              : at!.kind === 'priority'
              ? <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px] ${PRIORITY_RING[item.level ?? 4]}`} />
              : <span aria-hidden="true" data-hue={item.color ? hueFor(item.color) : undefined} className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${item.color ? 'bg-hue-solid' : 'bg-faint'}`} />}
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.secondary && <span className="shrink-0 truncate text-meta text-faint">{item.secondary}</span>}
        </li>
      ))}
    </ul>
  ) : null

  return { fieldProps, onKeyDown, list: list ?? ticked.list, live: ticked.live, openAt, open: shown }
}
