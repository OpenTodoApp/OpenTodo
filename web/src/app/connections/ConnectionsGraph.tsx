// The Connections graph (OpenSpec change notes-graph, design D2, D4, D5): the edges
// in one SVG layer, thin and quiet in the border colour, and each node a button
// over it at the position lib/graphLayout gave it: a small pill with the item's icon
// and title (an icon on the outer ring of a phone), the centre larger and marked
// with the accent. The node with focus or the pointer and its edges take the accent;
// a cut title shows whole beside it. Nothing moves unless the centre changes.
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { t } from '../../lib/i18n'
import { stepFrom, type Direction, type GraphLayout, type PlacedNode } from '../../lib/graphLayout'
import { Icon } from '../../ui'
import { LINK_ICON } from '../LinkOption'

const ARROWS: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }

/** The node's accessible name: its title, kind and place (D5). */
function nameOf(p: PlacedNode): string {
  return t('{title}, {kind, select, note {note} task {task} other {project}}, {ring, select, centre {in the centre} direct {linked directly} other {two steps away}}',
    { title: p.item.title, kind: p.item.kind, ring: p.ring === 0 ? 'centre' : p.ring === 1 ? 'direct' : 'outer' })
}

export interface GraphProps {
  layout: GraphLayout
  /** The connections' accessible name ("Connections of Trip"). */
  label: string
  /** Set after the first move to another centre: new nodes and the edges fade in. */
  moved: boolean
  /** A node to move focus to once drawn (the new centre); `onFocused` clears the request. */
  focusKey: string | null
  onFocused: () => void
  onCentre: (key: string) => void
  onOpen: (key: string) => void
}

export function ConnectionsGraph({ layout: l, label, moved, focusKey, onFocused, onCentre, onOpen }: GraphProps) {
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const [hover, setHover] = useState<string | null>(null)
  const [focused, setFocused] = useState<string | null>(null)
  const hot = hover ?? focused
  const centre = l.nodes[0]
  const at = new Map(l.nodes.map((p) => [p.item.key, p]))

  useLayoutEffect(() => {
    const el = focusKey ? refs.current.get(focusKey) : null
    if (!el) return
    el.focus({ preventScroll: true })
    onFocused()
  }, [focusKey, onFocused])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, p: PlacedNode) => {
    const dir = ARROWS[e.key]
    if (dir) {
      e.preventDefault()
      const next = stepFrom(l, p.item.key, dir)
      if (next) refs.current.get(next)?.focus()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onOpen(p.item.key)
    } else if (e.key === ' ') {
      e.preventDefault()
      if (p.ring !== 0) onCentre(p.item.key)
    }
  }

  return (
    <div role="group" aria-label={label} className={`connections-graph ${moved ? 'connections-graph--moved' : ''}`} style={{ width: l.width, height: l.height }}
      data-connections-graph={centre.item.key} data-fits={l.fits || undefined}>
      <svg key={centre.item.key} aria-hidden="true" className="connections-graph__edges" width={l.width} height={l.height} viewBox={`0 0 ${l.width} ${l.height}`}>
        {l.edges.map(([a, b]) => {
          const p = at.get(a)
          const q = at.get(b)
          if (!p || !q) return null
          const lit = hot === a || hot === b
          return <line key={`${a}|${b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="connections-graph__edge" data-hot={lit || undefined} data-edge={`${a}|${b}`} />
        })}
      </svg>
      {l.nodes.map((p) => {
        const isCentre = p.ring === 0
        const showTip = p.truncated || p.compact
        return (
          <button key={p.item.key} ref={(el) => { if (el) refs.current.set(p.item.key, el); else refs.current.delete(p.item.key) }}
            type="button" aria-label={nameOf(p)} data-node={p.item.key} data-ring={p.ring} data-hot={hot === p.item.key || undefined}
            className={`connections-node ${isCentre ? 'connections-node--centre' : ''} ${p.compact ? 'connections-node--compact' : ''} ${p.item.done ? 'connections-node--done' : ''}`}
            style={{ width: p.w, height: p.h, transform: `translate(${p.x - p.w / 2}px, ${p.y - p.h / 2}px)` }}
            onClick={() => (isCentre ? onOpen(p.item.key) : onCentre(p.item.key))}
            onKeyDown={(e) => onKeyDown(e, p)} onKeyUp={(e) => { if (e.key === ' ') e.preventDefault() }}
            onPointerEnter={() => setHover(p.item.key)} onPointerLeave={() => setHover((h) => (h === p.item.key ? null : h))}
            onFocus={() => setFocused(p.item.key)} onBlur={() => setFocused((f) => (f === p.item.key ? null : f))}>
            <Icon name={LINK_ICON[p.item.kind]} size="sm" className="shrink-0" />
            {!p.compact && <span className="connections-node__label user-text">{p.label}</span>}
            {showTip && <span aria-hidden="true" className="connections-node__tip user-text">{p.item.title}</span>}
          </button>
        )
      })}
      {l.markers.map((m) => (
        <span key={`more${m.ring}`} className="connections-graph__more" data-more={m.ring}
          style={{ width: m.w, height: m.h, transform: `translate(${m.x - m.w / 2}px, ${m.y - m.h / 2}px)` }}>
          <span aria-hidden="true">{t('+{n}', { n: m.count })}</span>
          <span className="sr-only">{t('{n} more', { n: m.count })}</span>
        </span>
      ))}
    </div>
  )
}
