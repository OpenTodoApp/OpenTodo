// The code block in the editor (OpenSpec change editor-copy-code-block, design D1,
// D3): a ProseMirror node view that draws a code_block with the same Copy button
// rendered Markdown has, so a command written in a task's notes is one click from
// the clipboard instead of three (source mode, select, copy). The button and its
// text rules are the shared block (./CodeBlock), never a second copy of them.
//
// The block must stay writable: a node view that is not contenteditable and has no
// content DOM makes the block impossible to type into. The `pre > code` element is
// therefore the node's content DOM (ProseMirror fills it with the block's text and
// takes the caret in it), and only the bar is the node view's own, uneditable part.
// The bar is a sibling of the code, never inside the content DOM: React's scheduler
// does not commit a root that lives under the element ProseMirror writes into, and
// the button never appeared. Renders into the bar are synchronous (flushSync) for
// the same reason: a queued commit could wait for a task that never comes.
// Lazy chunk only.
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import type { Node as PMNode } from 'prosemirror-model'
import type { NodeView } from 'prosemirror-view'
import { CopyCode } from './CodeBlock'

/** The block's language, or '' when it has none. */
const langOf = (node: PMNode): string => (node.attrs.lang as string) ?? ''

class CodeView implements NodeView {
  dom: HTMLElement
  /** The block's content DOM: ProseMirror writes the node's text into it. */
  contentDOM: HTMLElement
  private bar: HTMLElement
  private root: Root

  constructor(private node: PMNode) {
    // The dom keeps the schema's `pre > code` shape (richtextEditor.ts), so the
    // document still parses and serialises as it did. The bar is the dom's other
    // child, outside the content DOM, and uneditable.
    this.dom = document.createElement('div')
    this.dom.className = 'md-code'
    this.bar = document.createElement('div')
    this.bar.className = 'md-code__bar'
    this.bar.contentEditable = 'false'
    const pre = document.createElement('pre')
    pre.className = 'overflow-x-auto rounded-control bg-sunken dark:bg-raised p-2 font-mono text-meta'
    pre.dataset.scrollX = ''
    const code = document.createElement('code')
    pre.append(code)
    this.contentDOM = code
    this.dom.append(this.bar, pre)
    this.syncLang()
    this.root = createRoot(this.bar)
    this.render()
  }

  /** The language is the block's attribute, drawn as the renderer draws it. */
  private syncLang() {
    const lang = langOf(this.node)
    if (lang) this.dom.dataset.lang = lang
    else delete this.dom.dataset.lang
  }

  /** The button copies the block's current text, so it follows every edit. */
  private render() {
    flushSync(() => this.root.render(<CopyCode text={this.node.textContent} />))
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false
    const changedLang = langOf(node) !== langOf(this.node)
    const changedText = node.textContent !== this.node.textContent
    this.node = node
    if (changedLang) this.syncLang()
    if (changedText) this.render()
    return true
  }

  /**
   * A press on the bar is the button's, not the editor's: claiming it keeps
   * ProseMirror from placing the caret in the block when the button is clicked
   * (design D3). Everything inside the code is the editor's, so typing, clicking
   * and selecting there work as they do in any other block.
   */
  stopEvent(e: Event): boolean {
    const el = e.target as HTMLElement | null
    return !!el?.closest?.('.md-code__bar')
  }

  destroy() {
    const root = this.root
    // React may be rendering; unmount after the current task.
    setTimeout(() => root.unmount(), 0)
  }
}

/** Node views for a code block in the editor of a note or a comment. */
export const codeViews = {
  code_block: (node: PMNode) => new CodeView(node),
}
