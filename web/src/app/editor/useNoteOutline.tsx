// The editor's side of a note's outline (OpenSpec change note-outline): the headings
// read from each editor state (D1), the column or the menu by the room around the
// note (D2), the current heading and jumping (D3), Ctrl+Shift+O (D4).
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { TextSelection, type EditorState } from 'prosemirror-state'
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view'
import type { Node as PMNode } from 'prosemirror-model'
import { currentHeading, OUTLINE_MIN, outlineOf, sameOutline } from '../../lib/noteOutline'
import { LINE_PX, OutlineButton, OutlineColumn, type OutlineEntry, type OutlinePlace } from './NoteOutline'

/** The room a column needs: the readable column (40 rem) and the outline's 12 rem (D2). */
const COLUMN_ROOM_REM = 52

/** In a read-only note the headings take focus from the outline (D3), through node decorations. */
export function headingStops(doc: PMNode): DecorationSet {
  return DecorationSet.create(doc, outlineOf(doc).map((i) => Decoration.node(i.pos, i.pos + (doc.nodeAt(i.pos)?.nodeSize ?? 1), { tabindex: '-1' })))
}

/** The nearest ancestor that scrolls vertically, else the page's scroller. */
function scrollerOf(el: Element): Element {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY
    if ((y === 'auto' || y === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return document.scrollingElement ?? document.documentElement
}

function rem(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

/** Whether the room around the note (`[data-outline-room]`) is wide enough for the column. */
function useWideRoom(frame: RefObject<HTMLElement | null>, place: OutlinePlace, shown: boolean): boolean {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const room = place === 'auto' && shown ? frame.current?.closest<HTMLElement>('[data-outline-room]') : null
    if (!room) return setWide(false)
    const measure = () => setWide(room.clientWidth >= COLUMN_ROOM_REM * rem())
    measure()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(room)
    window.addEventListener('resize', measure)
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure) }
  }, [frame, place, shown])
  return wide
}

/** Follows the reading position: the heading at the top of the scroller is current (D3). */
function useCurrentHeading(view: RefObject<EditorView | null>, shown: boolean, count: number) {
  const [current, setCurrent] = useState(-1)
  const held = useRef(0)
  useEffect(() => {
    if (!shown) return
    let frame = 0
    const measure = () => {
      frame = 0
      const v = view.current
      if (!v || v.isDestroyed || performance.now() < held.current) return
      const scroller = scrollerOf(v.dom)
      const box = scroller === document.scrollingElement ? { top: 0, height: window.innerHeight } : { top: scroller.getBoundingClientRect().top, height: scroller.clientHeight }
      const tops = outlineOf(v.state.doc).map((i) => ((v.nodeDOM(i.pos) as HTMLElement | null)?.getBoundingClientRect().top ?? Infinity) - box.top)
      const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2 && scroller.scrollHeight > scroller.clientHeight
      // At the end of the scroller the last heading in view is current: it cannot reach the top.
      setCurrent(atEnd ? currentHeading(tops, box.height - LINE_PX) : currentHeading(tops, box.height / 4))
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure) }
    measure()
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll, { capture: true }) }
  }, [view, shown, count])
  /** Marks `i` after a jump and keeps it while the scroll settles. */
  const hold = useCallback((i: number) => { held.current = performance.now() + 900; setCurrent(i) }, [])
  return [current, hold] as const
}

/**
 * The outline of the note in `view` (D1 to D4): call `onState` with each new editor
 * state, `open` from Ctrl+Shift+O. `element` is the column or the Outline button.
 */
export function useNoteOutline(o: { view: RefObject<EditorView | null>; frame: RefObject<HTMLElement | null>; readOnly: boolean; place: OutlinePlace }) {
  const [items, setItems] = useState<OutlineEntry[]>([])
  const shown = items.length >= OUTLINE_MIN
  const wide = useWideRoom(o.frame, o.place, shown)
  const [current, hold] = useCurrentHeading(o.view, shown, items.length)
  const [menuOpen, setMenuOpen] = useState(false)
  const column = useRef<HTMLElement>(null)
  const readOnly = useRef(o.readOnly)
  readOnly.current = o.readOnly

  const onState = useCallback((state: EditorState) => {
    const next = outlineOf(state.doc)
    setItems((prev) => (sameOutline(prev, next) ? prev : next.map(({ level, text }) => ({ level, text }))))
  }, [])
  /** Scroll heading `i` to the top and put the caret at its start, or focus it in a read-only note (D3). */
  const go = (i: number) => {
    const v = o.view.current
    const item = v && !v.isDestroyed ? outlineOf(v.state.doc)[i] : undefined
    if (!v || !item) return
    const dom = v.nodeDOM(item.pos) as HTMLElement | null
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    dom?.scrollIntoView?.({ block: 'start', behavior: still ? 'auto' : 'smooth' })
    if (readOnly.current) dom?.focus({ preventScroll: true })
    else {
      v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, item.pos + 1)))
      v.focus()
    }
    hold(i)
  }
  // Back to the note where it was (Esc, a closed menu), unless focus already moved into it (a heading was chosen).
  const toNote = () => { const v = o.view.current; if (v && !v.isDestroyed && !v.dom.contains(document.activeElement)) v.focus() }
  /** Ctrl+Shift+O (D4): focus the column at the current heading, or open the menu; false without an outline. */
  const open = (): boolean => {
    if (!shown) return false
    if (!wide) { setMenuOpen(true); return true }
    const buttons = column.current?.querySelectorAll<HTMLButtonElement>('[data-outline-item]')
    buttons?.[Math.max(0, current)]?.focus()
    return true
  }
  const element = !shown ? null : wide
    ? <OutlineColumn ref={column} items={items} current={current} onGo={go} onEscape={toNote} menuOpen={menuOpen} onMenu={setMenuOpen} />
    : <OutlineButton items={items} current={current} onGo={go} open={menuOpen} onOpenChange={(v) => { setMenuOpen(v); if (!v) toNote() }} />
  return { onState, open, place: shown ? (wide ? 'column' as const : 'menu' as const) : undefined, element }
}

