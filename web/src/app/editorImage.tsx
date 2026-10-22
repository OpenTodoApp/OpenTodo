// The image node in the editor (OpenSpec change editor-everywhere, design D5):
// a ProseMirror node view that renders the app's EmbeddedImage (the task's
// attachment, or a placeholder naming its state) and, while selected, a field
// for the alternative text. Lazy chunk only.
import { createRoot, type Root } from 'react-dom/client'
import type { Node as PMNode } from 'prosemirror-model'
import { NodeSelection } from 'prosemirror-state'
import type { EditorView, NodeView } from 'prosemirror-view'
import { t } from '../lib/i18n'
import { EmbeddedImage } from './Markdown'

class ImageView implements NodeView {
  dom: HTMLElement
  private root: Root
  private selected = false

  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined, private taskId: string | null) {
    this.dom = document.createElement('figure')
    this.dom.className = 'note-image'
    this.dom.contentEditable = 'false'
    this.dom.dataset.attachment = node.attrs.id as string
    this.root = createRoot(this.dom)
    this.render()
  }

  private setAlt(alt: string) {
    const pos = this.getPos()
    if (pos === undefined) return
    const tr = this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, alt })
    tr.setSelection(NodeSelection.create(tr.doc, pos))
    this.view.dispatch(tr)
  }

  private render() {
    const { id, alt } = this.node.attrs as { id: string; alt: string }
    const editable = this.view.editable
    this.root.render(
      <>
        <EmbeddedImage id={id} alt={alt} taskId={this.taskId} />
        {this.selected && editable && (
          <input className="ui-input mt-1 text-meta" aria-label={t('Alternative text')} placeholder={t('Describe the image')} defaultValue={alt}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault()
                this.view.focus()
              }
            }}
            onBlur={(e) => { if (e.target.value !== alt) this.setAlt(e.target.value) }} />
        )}
      </>,
    )
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.dom.dataset.attachment = node.attrs.id as string
    this.render()
    return true
  }

  selectNode() {
    this.selected = true
    this.dom.classList.add('ProseMirror-selectednode')
    this.render()
  }

  deselectNode() {
    this.selected = false
    this.dom.classList.remove('ProseMirror-selectednode')
    this.render()
  }

  /** Typing in the alternative text field is the field's, not the editor's. */
  stopEvent(e: Event): boolean {
    return !!(e.target as HTMLElement | null)?.closest?.('input')
  }

  ignoreMutation(): boolean {
    return true
  }

  destroy() {
    const root = this.root
    // React may be rendering; unmount after the current task.
    setTimeout(() => root.unmount(), 0)
  }
}

/** Node views for the editor of a task's notes or comments. */
export function imageViews(taskId: string | null) {
  return { image: (node: PMNode, view: EditorView, getPos: () => number | undefined) => new ImageView(node, view, getPos, taskId) }
}
