// The Connections dialog (OpenSpec change notes-graph, design D1 to D6): one item at
// the centre, what it links with on an inner ring and their links on an outer one,
// or the same as two lists, Links and Linked from. A card on a computer, a
// full-screen sheet on a phone; the header holds the centre's title, the Graph /
// List switch and Close. Read from the device's link index only: offline, on an
// unlocked encrypted account, nothing sent. A lazy chunk, mounted by the Shell.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { readString, writeString } from '../../lib/deviceStorage'
import { layout, neighbourhood, NARROW, type Box, type GraphItem } from '../../lib/graphLayout'
import { t } from '../../lib/i18n'
import { projectName, useLinkIndex, type LinkIndex, type LinkKind, type Reference } from '../../lib/noteLinks'
import { Dialog, Icon, SegmentedControl, useMediaQuery } from '../../ui'
import { ReferenceRow } from '../LinkedReferences'
import { LINK_ICON } from '../LinkOption'
import { openNote } from '../notes/openNote'
import { ConnectionsGraph } from './ConnectionsGraph'

/** The per-device choice of Graph or List (D5). */
export const CONNECTIONS_VIEW_KEY = 'opentodo.connections.view'
export type View = 'graph' | 'list'

interface Centre { kind: LinkKind; id: string }
const keyOf = (c: Centre) => `${c.kind}:${c.id}`
const centreOf = (key: string): Centre => {
  const at = key.indexOf(':')
  return { kind: key.slice(0, at) as LinkKind, id: key.slice(at + 1) }
}

/** An item as the graph reads it, or null when the device cannot read it (D1). */
function itemOf(index: LinkIndex, kind: LinkKind, id: string): GraphItem | null {
  const target = index.target(kind, id)
  return target ? { key: `${kind}:${id}`, kind, id, title: target.title, updated: target.updated, done: target.done } : null
}

/** Everything linked with an item, either way, that the device can read. */
function neighboursIn(index: LinkIndex) {
  return (key: string): GraphItem[] => {
    const { kind, id } = centreOf(key)
    const out: GraphItem[] = []
    for (const r of [...index.links(kind, id), ...index.references(kind, id)]) {
      const item = itemOf(index, r.kind, r.id)
      if (item) out.push(item)
    }
    return out
  }
}

// The graph's box before it is measured: the card's body on a computer, the screen below the header on a phone.
function guessBox(phone: boolean): Box {
  if (!phone || typeof window === 'undefined') return { width: 608, height: 384 }
  return { width: Math.max(280, window.innerWidth - 32), height: Math.max(320, window.innerHeight - 96) }
}

export default function ConnectionsDialog({ kind, id, onClose }: { kind: LinkKind; id: string; onClose: () => void }) {
  const live = useLinkIndex()
  const phone = useMediaQuery(`(max-width: ${NARROW - 0.02}px)`)
  const [trail, setTrail] = useState<Centre[]>(() => [{ kind, id }])
  const centre = trail[trail.length - 1]
  const [chosen, setChosen] = useState<View | null>(() => {
    const v = readString(CONNECTIONS_VIEW_KEY)
    return v === 'graph' || v === 'list' ? v : null
  })
  // Focus starts on the centre and follows each new centre (D4); null once moved.
  const [focusKey, setFocusKey] = useState<string | null>(() => keyOf({ kind, id }))
  const focused = useCallback(() => setFocusKey(null), [])
  const area = useRef<HTMLDivElement>(null)

  const index = live?.index ?? null
  const version = live?.version
  const model = useMemo(() => {
    if (!index) return null
    const item = itemOf(index, centre.kind, centre.id)
    if (!item) return { item: null, links: [], from: [], n: null }
    // The version stands for the index's contents: a change by sync redraws once (D6).
    void version
    return {
      item,
      links: index.links(centre.kind, centre.id),
      from: index.references(centre.kind, centre.id),
      n: neighbourhood(item, neighboursIn(index)),
    }
  }, [index, version, centre.kind, centre.id])

  const box = useAreaBox(area, phone)
  const picture = useMemo(() => (model?.n ? layout(model.n, box, phone) : null), [model, box.width, box.height, phone]) // eslint-disable-line react-hooks/exhaustive-deps -- the box by its size
  // The List first when the picture does not fit, unless the person chose (D5, owner decision).
  const view: View = chosen ?? (picture && !picture.fits ? 'list' : 'graph')

  // A centre that went away (moved to the Trash meanwhile) steps back, or closes.
  useEffect(() => {
    if (!model || model.item) return
    if (trail.length > 1) setTrail((tr) => tr.slice(0, -1))
    else onClose()
  }, [model, trail.length, onClose])

  const centreOn = useCallback((key: string) => {
    setTrail((tr) => (keyOf(tr[tr.length - 1]) === key ? tr : [...tr, centreOf(key)]))
    setFocusKey(key)
  }, [])
  const back = useCallback(() => {
    setTrail((tr) => {
      if (tr.length < 2) return tr
      const next = tr.slice(0, -1)
      setFocusKey(keyOf(next[next.length - 1]))
      return next
    })
  }, [])
  const open = useCallback((key: string) => {
    const c = centreOf(key)
    onClose()
    openNote({ source: c.kind, id: c.id })
  }, [onClose])
  const choose = (v: View) => {
    setChosen(v)
    writeString(CONNECTIONS_VIEW_KEY, v)
  }

  const title = model?.item?.title ?? ''
  const label = t('Connections of {title}', { title })
  const onBodyKey = (e: KeyboardEvent) => {
    if (e.key === 'Backspace' && trail.length > 1 && !e.defaultPrevented) {
      e.preventDefault()
      back()
    }
  }

  return (
    <ConnectionsFrame kind={centre.kind} title={title} label={label} view={view} onView={choose} onClose={onClose}>
      <div onKeyDown={onBodyKey}>
        {view === 'graph'
          ? (
            <div ref={area} className="connections-area" data-connections-area>
              {picture && model?.item && (
                <ConnectionsGraph layout={picture} label={label} moved={trail.length > 1 || centre.id !== id}
                  focusKey={focusKey} onFocused={focused} onCentre={centreOn} onOpen={open} />
              )}
            </div>
          )
          : model?.item && <ConnectionsList links={model.links} from={model.from} focus={focusKey !== null} onFocused={focused} onCentre={centreOn} onClose={onClose} />}
      </div>
    </ConnectionsFrame>
  )
}

/** The dialog and its one header row: the centre's icon and title, Graph / List, Close (D3). */
export function ConnectionsFrame({ kind, title, label, view, onView, onClose, children }: {
  kind: LinkKind; title: string; label: string; view: View; onView: (v: View) => void; onClose: () => void; children: ReactNode
}) {
  return (
    <Dialog size="graph" onClose={onClose} label={label} testId="connections"
      title={(
        <span className="flex min-w-0 items-center gap-2">
          <Icon name={LINK_ICON[kind]} size="sm" className="shrink-0 text-muted" />
          <span className="user-text truncate">{title}</span>
        </span>
      )}
      actions={(
        <SegmentedControl label={t('Show as')} value={view} onChange={onView} data-connections-view={view}
          options={[{ id: 'graph', label: t('Graph') }, { id: 'list', label: t('List') }]} />
      )}>
      {children}
    </Dialog>
  )
}

/** The graph's box: the area's measured size, a guess until it is drawn (and while the List shows). */
export function useAreaBox(area: RefObject<HTMLDivElement | null>, phone: boolean): Box {
  const [measured, setMeasured] = useState<Box | null>(null)
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    const read = () => {
      const w = Math.floor(el.clientWidth)
      const h = Math.floor(el.clientHeight)
      if (w > 0 && h > 0) setMeasured((b) => (b && b.width === w && b.height === h ? b : { width: w, height: h }))
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  })
  return measured ?? guessBox(phone)
}

/** The List view (D5): Links and Linked from, with the rows of Linked references, open and centre. */
export function ConnectionsList({ links, from, focus, onFocused, onCentre, onClose }: {
  links: readonly Reference[]; from: readonly Reference[]; focus: boolean; onFocused: () => void; onCentre: (key: string) => void; onClose: () => void
}) {
  const first = useRef<HTMLDivElement>(null)
  // On opening, and after centring from the list: focus on its first row.
  useLayoutEffect(() => {
    if (!focus) return
    first.current?.querySelector<HTMLElement>('a')?.focus({ preventScroll: true })
    onFocused()
  }, [focus, onFocused])
  const group = (heading: string, rows: readonly Reference[], hook: string) => rows.length > 0 && (
    <section aria-label={heading} className="space-y-1" data-connections-list={hook}>
      <h3 className="linked-refs__head">{heading}<span className="text-faint tabular-nums">{rows.length}</span></h3>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <ReferenceRow key={`${r.kind}:${r.id}`} r={r} project={r.kind === 'project' ? null : projectName(r.projectId)} onOpen={onClose}
            after={(
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target mt-0.5 shrink-0 px-1.5 text-muted" aria-label={t('Centre on {title}', { title: r.title })}
                onClick={() => onCentre(`${r.kind}:${r.id}`)} data-connections-centre={`${r.kind}:${r.id}`}>
                <Icon name="locate-fixed" size="sm" />
              </button>
            )} />
        ))}
      </ul>
    </section>
  )
  return (
    <div ref={first} className="space-y-5">
      {group(t('Links'), links, 'links')}
      {group(t('Linked from'), from, 'from')}
    </div>
  )
}
