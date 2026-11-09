// The link node in the editor (OpenSpec change note-links, design D2, D3, D4, D7):
// a ProseMirror node view that reads as the target's current title, from the
// device's rows (lib/noteLinks), or as its stored text in the muted tone when the
// target is missing, in the Trash or out of reach. Ctrl or Cmd and a click opens
// it in place; in a read-only note a plain click does. Never writes. Lazy chunk only.
import { createRoot, type Root } from 'react-dom/client'
import type { Node as PMNode } from 'prosemirror-model'
import { TextSelection } from 'prosemirror-state'
import type { EditorView, NodeView } from 'prosemirror-view'
import { refOf, resolve, watchLinks } from '../lib/noteLinks'
import { openRef, RefChip } from './RefChip'

class RefView implements NodeView {
  dom: HTMLElement
  private root: Root
  private unwatch: () => void

  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined) {
    this.dom = document.createElement('span')
    this.dom.className = 'note-ref-host'
    this.dom.contentEditable = 'false'
    this.root = createRoot(this.dom)
    this.unwatch = watchLinks(() => this.render())
    this.render()
  }

  private render() {
    const href = this.node.attrs.href as string
    const label = (this.node.attrs.label as string) || href
    const ref = refOf(href)
    this.dom.dataset.refHref = href
    if (!ref) {
      this.root.render(<span className="note-ref" data-ref-state="muted">{label}</span>)
      return
    }
    const target = resolve(ref.kind, ref.id)
    this.root.render(
      <RefChip kind={ref.kind} id={ref.id} title={target?.title ?? null} label={label} done={target?.done} tabIndex={this.view.editable ? -1 : undefined}
        onOpen={(e) => {
          e.preventDefault()
          // Keep the editor's own Ctrl-click (a web link in a new tab) away from it.
          e.stopPropagation()
          if (!this.view.editable || e.metaKey || e.ctrlKey) return openRef(ref.kind, ref.id)
          // A plain click while writing puts the caret after the link.
          this.caretAfter()
        }} />,
    )
  }

  private caretAfter() {
    const pos = this.getPos()
    if (pos === undefined) return
    const v = this.view
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, pos + this.node.nodeSize)))
    v.focus()
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.render()
    return true
  }

  ignoreMutation(): boolean {
    return true
  }

  stopEvent(e: Event): boolean {
    return e.type === 'click'
  }

  destroy(): void {
    this.unwatch()
    const root = this.root
    // Unmounting during a React render warns; the root goes on the next task.
    setTimeout(() => root.unmount(), 0)
  }
}

export const refViews = {
  ref: (node: PMNode, view: EditorView, getPos: () => number | undefined) => new RefView(node, view, getPos),
}
