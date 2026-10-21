// Note-specific editor actions (OpenSpec change editor-everywhere, design D6, D7):
// mentions written as a mark naming the member, the id list stored next to the
// note, and Make subtask on a check-list line. Lazy chunk only.
import type { Node as PMNode } from 'prosemirror-model'
import { type EditorState, TextSelection, type Transaction } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import type { RNode } from './richtext'
import { schema } from './richtextEditor'
import type { Suggest } from './editorSuggest'

/** The member ids a model mentions, in order of first appearance. */
export function mentionIds(nodes: RNode[]): string[] {
  const out = new Set<string>()
  const walk = (list: RNode[]) => {
    for (const n of list) {
      for (const r of n.runs ?? []) {
        const id = (r.marks.mention as { id?: unknown } | undefined)?.id
        if (typeof id === 'string' && id) out.add(id)
      }
      walk(n.content ?? [])
    }
  }
  walk(nodes)
  return [...out]
}

/** Whether two id lists hold the same ids (order does not matter). */
export function sameIds(a: readonly string[] | undefined, b: readonly string[]): boolean {
  const sa = new Set(a ?? [])
  return sa.size === new Set(b).size && b.every((x) => sa.has(x))
}

/** Replace the typed `@query` with the member's `@token`, marked as a mention, and a space. */
export function insertMention(view: EditorView, s: Suggest, member: { id: string; token: string }): void {
  const mark = schema.marks.mention.create({ id: member.id, name: member.token })
  const tr = view.state.tr.replaceWith(s.from, s.to, [schema.text(`@${member.token}`, [mark]), schema.text(' ')])
  tr.removeStoredMark(schema.marks.mention)
  view.dispatch(tr.scrollIntoView())
  view.focus()
}

/** The check-list line around the selection: its position, text and checked state. */
export function checkLineAt(state: EditorState): { pos: number; node: PMNode; title: string; checked: boolean } | null {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type !== schema.nodes.list_item) continue
    if (node.attrs.checked === null) return null
    const first = node.firstChild
    const title = (first?.textContent ?? '').trim()
    return title ? { pos: $from.before(d), node, title, checked: node.attrs.checked === true } : null
  }
  return null
}

/**
 * The note change of Make subtask: the check-list line becomes a plain line
 * holding a link to the subtask's address (`[title](?task=<id>)`), caret after it.
 */
export function subtaskLine(state: EditorState, id: string): Transaction | null {
  const line = checkLineAt(state)
  if (!line) return null
  const first = line.node.firstChild as PMNode
  const link = schema.marks.link.create({ href: `?task=${id}` })
  const para = schema.nodes.paragraph.create(null, schema.text(line.title, [link]))
  const tr = state.tr.setNodeMarkup(line.pos, undefined, { checked: null })
  const from = line.pos + 1
  tr.replaceWith(from, from + first.nodeSize, para)
  tr.setSelection(TextSelection.create(tr.doc, from + para.nodeSize - 1))
  return tr
}
