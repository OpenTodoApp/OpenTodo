// The notes editor's side of the Markdown source mode (OpenSpec change
// note-markdown-source): on or off for as long as the note is open (never stored),
// Ctrl+Shift+M, the slash entry and the Markdown button toggle it (D4), the caret goes
// back to the block that held it (D1), and remote merges pass through the source (D3).
import { lazy, Suspense, useEffect, useRef, useState, type RefObject } from 'react'
import { TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { docBlocks } from '../../lib/markdownSource'
import type { SourceHandle } from './MarkdownSource'

// The textarea and its block application, fetched on first use of the mode.
const MarkdownSource = lazy(() => import('./MarkdownSource'))

export function useSourceMode(view: RefObject<EditorView | null>, readOnly: boolean, onEscape: () => void) {
  const [on, setOn] = useState(false)
  const handle = useRef<SourceHandle>(null)
  // The block whose start takes the caret once the rich text is back.
  const back = useRef<number | null>(null)
  const toggle = () => {
    if (!on) return setOn(true)
    back.current = handle.current?.leave() ?? 0
    setOn(false)
  }
  useEffect(() => {
    const v = view.current
    if (on || back.current === null || !v || v.isDestroyed) return
    const block = docBlocks(v.state.doc)[back.current]
    back.current = null
    if (!readOnly && block) v.dispatch(v.state.tr.setSelection(TextSelection.near(v.state.doc.resolve(block.from + 1))))
    v.focus()
  }, [on, view, readOnly])
  const element = on && view.current ? (
    <Suspense fallback={null}>
      <MarkdownSource view={view.current} readOnly={readOnly} handle={handle} onToggle={toggle} onEscape={onEscape} />
    </Suspense>
  ) : null
  return {
    on,
    toggle,
    element,
    /** Around a remote merge (D3): apply what was typed first, then show the merged text. */
    beforeRemote: () => handle.current?.beforeRemote(),
    afterRemote: () => handle.current?.afterRemote(),
    /** The note closes: what was typed is applied. */
    leave: () => { if (handle.current) handle.current.leave() },
  }
}
