// The smart picker's engine (OpenSpec change ui-primitives, design D6): sources,
// matching, most-probable ordering, the active option, keys and announcements.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { pickScores, rankBy, recordPick } from '../../lib/pickRank'
import { matchPrepared, prepare, prepareQuery, type Match } from './match'
import { t } from '../../lib/i18n'

export type AsyncSource<T> = (query: string, signal: AbortSignal) => Promise<{ items: T[]; hasMore?: boolean }>

export interface ComboboxConfig<T> {
  source: readonly T[] | AsyncSource<T>
  getKey: (item: T) => string
  getLabel: (item: T) => string
  getSecondary?: (item: T) => string | undefined
  /** Extra words an item matches on without showing them (old names of a command). */
  getKeywords?: (item: T) => string | undefined
  /** Named group of an item (shown as a heading); groups keep their first-seen order. */
  getGroup?: (item: T) => string | undefined
  /** Ancestor labels (project tree): indented without a query, shown as a path when filtering. */
  getPath?: (item: T) => string[]
  /** Keys listed first in this order, before ranking (e.g. "Unassigned", "You"). */
  pinned?: readonly string[]
  /** Keys currently selected (marked). */
  selected?: readonly string[]
  multiple?: boolean
  /** Ranking context for pick history on this device ("label", "assignee:<project>"…). */
  rankContext?: string
  onPick: (item: T) => unknown
  /** Offered as the last option when the query matches no option exactly. */
  onCreate?: (query: string) => unknown
  /** Escape, or a single pick. */
  onClose?: () => void
  /** Listed instead of the source while the query is empty (command palette: context and recent entries). */
  emptySource?: readonly T[]
  /**
   * Listed first while a query is typed, without text matching (command palette:
   * filter-query results). An entry whose key is also a text match is dropped.
   */
  prefix?: readonly T[]
  /** Listed last while a query is typed, without text matching ("Search Help for …"). */
  suffix?: readonly T[]
  /** At most this many options; `more` counts the rest. */
  limit?: number
}

export type ComboOption<T> =
  | { kind: 'item'; key: string; item: T; label: string; secondary?: string; path: string[]; group?: string; depth: number; m: Match }
  | { kind: 'create'; key: string; query: string }

export const ASYNC_DEBOUNCE_MS = 120
const ANNOUNCE_MS = 300
const RECENT_IN_TREE = 5

function isAsync<T>(s: ComboboxConfig<T>['source']): s is AsyncSource<T> {
  return typeof s === 'function'
}

export function useCombobox<T>(cfg: ComboboxConfig<T>) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [asyncItems, setAsyncItems] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [scores, setScores] = useState<Map<string, number>>(new Map())
  const [announcement, setAnnouncement] = useState('')
  const requestId = useRef(0)

  // Ranking is read once when the picker opens and frozen while it is open.
  useEffect(() => {
    if (!cfg.rankContext) return
    let live = true
    void pickScores(cfg.rankContext).then((s) => { if (live) setScores(s) }).catch(() => {})
    return () => { live = false }
  }, [cfg.rankContext])

  // Async sources: debounced, aborted per keystroke, stale answers dropped.
  useEffect(() => {
    if (!isAsync(cfg.source)) return
    const source = cfg.source
    const req = ++requestId.current
    const ctl = new AbortController()
    setLoading(true)
    const entry = setTimeout(() => {
      source(query, ctl.signal).then((res) => {
        if (req !== requestId.current) return
        setAsyncItems(res.items)
        setLoading(false)
      }, () => { if (req === requestId.current) setLoading(false) })
    }, ASYNC_DEBOUNCE_MS)
    return () => { clearTimeout(entry); ctl.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, isAsync(cfg.source) ? cfg.source : null])

  const fullItems = isAsync(cfg.source) ? asyncItems : cfg.source
  const items = !query.trim() && cfg.emptySource ? cfg.emptySource : fullItems
  // Fold each option's text once per source, not on every keystroke.
  const prepared = useMemo(() => items.map((i) => prepare(cfg.getLabel(i), [cfg.getSecondary?.(i), cfg.getKeywords?.(i)].filter(Boolean).join(' '))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items])

  const allOptions = useMemo<ComboOption<T>[]>(() => {
    const q = query.trim()
    const toOption = (item: T, m: Match, depthOverride?: number): ComboOption<T> => {
      const path = cfg.getPath?.(item) ?? []
      return {
        kind: 'item', key: cfg.getKey(item), item, label: cfg.getLabel(item), secondary: cfg.getSecondary?.(item),
        path, group: cfg.getGroup?.(item), depth: depthOverride ?? (q ? 0 : path.length), m,
      }
    }
    const pinned = cfg.pinned ?? []
    const pinIndex = (k: string) => pinned.indexOf(k)
    let out: ComboOption<T>[]
    if (!q) {
      const empty = { tier: 3, gaps: 0, label: [], secondary: [] } as Match
      const pins = pinned.map((k) => items.find((i) => cfg.getKey(i) === k)).filter((i): i is T => i !== undefined).map((i) => toOption(i, empty, 0))
      const rest = items.filter((i) => pinIndex(cfg.getKey(i)) < 0)
      if (cfg.emptySource) {
        // The caller ordered the empty list itself (context first, then recent picks).
        out = [...pins, ...rest.map((i) => toOption(i, empty))]
      } else if (cfg.getPath && scores.size > 0) {
        // A tree keeps its shape; recent picks are offered on top as their own group.
        const recent = rankBy(rest.filter((i) => scores.has(cfg.getKey(i))), cfg.getKey, scores).slice(0, RECENT_IN_TREE)
          .map((i) => ({ ...toOption(i, empty, 0), group: t('Recent'), key: `recent:${cfg.getKey(i)}` } as ComboOption<T>))
        out = [...pins, ...recent, ...rest.map((i) => toOption(i, empty))]
      } else {
        out = [...pins, ...rankBy(rest, cfg.getKey, scores).map((i) => toOption(i, empty))]
      }
    } else {
      const pq = prepareQuery(q)
      out = items
        .map((item, i) => ({ item, i, m: matchPrepared(pq, prepared[i], cfg.getLabel(item).length) }))
        .filter((x) => x.m.tier > 0)
        .sort((a, b) => b.m.tier - a.m.tier || a.m.gaps - b.m.gaps
          || (scores.get(cfg.getKey(b.item)) ?? 0) - (scores.get(cfg.getKey(a.item)) ?? 0) || a.i - b.i)
        .map((x) => toOption(x.item, x.m))
    }
    if (q && cfg.prefix?.length) {
      const keys = new Set(out.map((o) => o.key))
      const full = { tier: 3, gaps: 0, label: [], secondary: [] } as Match
      out = [...cfg.prefix.filter((i) => !keys.has(cfg.getKey(i))).map((i) => toOption(i, full, 0)), ...out]
    }
    if (q && cfg.suffix?.length) {
      const full = { tier: 3, gaps: 0, label: [], secondary: [] } as Match
      out = [...out, ...cfg.suffix.map((i) => toOption(i, full, 0))]
    }
    if (q && cfg.onCreate && !out.some((o) => o.kind === 'item' && o.m.tier === 3)) {
      out = [...out, { kind: 'create', key: `create:${q}`, query: q }]
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, prepared, query, scores, cfg.pinned, cfg.prefix, cfg.suffix])
  const more = cfg.limit !== undefined ? Math.max(0, allOptions.length - cfg.limit) : 0
  const options = more ? allOptions.slice(0, cfg.limit) : allOptions

  useEffect(() => { setActive(0) }, [query])
  const activeIndex = Math.min(active, Math.max(0, options.length - 1))

  // Result count for assistive technology, after typing pauses.
  const resultCount = options.filter((o) => o.kind === 'item').length
  useEffect(() => {
    if (!query.trim()) { setAnnouncement(''); return }
    const x1 = setTimeout(() => setAnnouncement(resultCount === 0 ? t('No matches') : t('{n, plural, one {# result available} other {# results available}}', { n: resultCount })), ANNOUNCE_MS)
    return () => clearTimeout(x1)
  }, [resultCount, query])

  const pick = async (opt: ComboOption<T> | undefined) => {
    if (!opt) return
    if (opt.kind === 'create') {
      await cfg.onCreate?.(opt.query)
    } else {
      await cfg.onPick(opt.item)
      if (cfg.rankContext) void recordPick(cfg.rankContext, opt.key.replace(/^recent:/, '')).catch(() => {})
    }
    if (cfg.multiple) setQuery('')
    else cfg.onClose?.()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (options.length === 0) return
      setActive((i) => (e.key === 'ArrowDown' ? (Math.min(i, options.length - 1) + 1) % options.length : (Math.min(i, options.length - 1) - 1 + options.length) % options.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      void pick(options[activeIndex])
    } else if (e.key === 'Escape' && cfg.onClose) {
      e.preventDefault()
      e.stopPropagation()
      cfg.onClose()
    }
  }

  const selected = new Set(cfg.selected ?? [])
  const optionId = (i: number) => `${id}-opt-${i}`
  return {
    id, listboxId: `${id}-list`, optionId, query, setQuery, options, more, activeIndex, setActive, loading, announcement,
    onKeyDown, pick, isSelected: (o: ComboOption<T>) => o.kind === 'item' && selected.has(o.key.replace(/^recent:/, '')),
    multiple: !!cfg.multiple,
  }
}

export type ComboboxState<T> = ReturnType<typeof useCombobox<T>>
