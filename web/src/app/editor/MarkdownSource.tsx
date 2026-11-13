// A note's Markdown source (OpenSpec change note-markdown-source): the note's Markdown
// in a plain textarea in the note's place (D1), applied to the document block by block
// at each pause and on leaving (D2), remote edits shown without moving the caret (D3).
// Loaded with React.lazy by the notes editor on first use; the mode is component state.
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import type { EditorView } from 'prosemirror-view'
import { applySource, blockAt, mapCaret, sourceOf } from '../../lib/markdownSource'
import { t } from '../../lib/i18n'

/** The pause after the last keystroke before the source is applied (the editor's local save). */
const PAUSE_MS = 400

/** What the notes editor calls around a remote merge and when it leaves the mode. */
export interface SourceHandle {
  /** Before a remote update is merged: apply what was typed, so both edits merge in the document. */
  beforeRemote: () => void
  /** After it: the new source text, the caret kept in its block. */
  afterRemote: () => void
  /** Apply what was typed; the index of the block that holds the caret. */
  leave: () => number
}

const isToggle = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'm'

export default function MarkdownSource({ view, readOnly, handle, onToggle, onEscape }: {
  view: EditorView
  readOnly: boolean
  handle: Ref<SourceHandle>
  /** Ctrl+Shift+M in the source: back to rich text. */
  onToggle: () => void
  onEscape: () => void
}) {
  const [text, setText] = useState(() => sourceOf(view.state.doc))
  const area = useRef<HTMLTextAreaElement>(null)
  const textRef = useRef(text)
  textRef.current = text
  // The source as last applied, and the document's source then (D3).
  const applied = useRef(text)
  const before = useRef(text)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const caret = useRef<number | null>(null)

  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (readOnly || view.isDestroyed || textRef.current === applied.current) return
    const tr = applySource(view.state, textRef.current)
    if (tr) view.dispatch(tr)
    applied.current = textRef.current
  }
  useImperativeHandle(handle, () => ({
    beforeRemote: () => { flush(); before.current = sourceOf(view.state.doc) },
    afterRemote: () => {
      const next = sourceOf(view.state.doc)
      if (next === before.current) return
      const el = area.current
      if (el && document.activeElement === el) caret.current = mapCaret(textRef.current, next, el.selectionStart)
      applied.current = next
      before.current = next
      setText(next)
    },
    leave: () => {
      flush()
      return blockAt(textRef.current, area.current?.selectionStart ?? 0)
    },
  }))
  // Apply on leaving, whatever the way out (closing the note included).
  useEffect(() => () => flush(), []) // eslint-disable-line react-hooks/exhaustive-deps -- once, on unmount

  // The textarea grows with the text, so the note's own scroller scrolls it (D1: no new scroll region).
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
    if (caret.current !== null) {
      el.setSelectionRange(caret.current, caret.current)
      caret.current = null
    }
  }, [text])
  useEffect(() => { area.current?.focus({ preventScroll: true }) }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isToggle(e)) { e.preventDefault(); e.stopPropagation(); onToggle(); return }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); flush(); e.currentTarget.blur(); onEscape() }
  }
  return (
    <textarea ref={area} className="notes-source" value={text} readOnly={readOnly} spellCheck={false} rows={3}
      aria-label={t('Markdown source of the note')} data-notes-source
      onChange={(e) => {
        setText(e.target.value)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(flush, PAUSE_MS)
      }}
      onBlur={flush} onKeyDown={onKeyDown} />
  )
}
