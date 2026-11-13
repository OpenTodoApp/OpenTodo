// Note-specific editor actions (OpenSpec change editor-everywhere, design D6, D7):
// mentions written as a mark naming the member, the id list stored next to the
// note, and Make subtask on a check-list line or a selection of them (and Make tasks in
// project and standalone notes, note-checklist-tasks). Lazy chunk only.
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
  return line ? linesToLinks(state, [line], [id]) : null
}

/** At most this many lines become tasks in one command (note-checklist-tasks D3). */
export const MAX_LINES = 50

/** A check-list line: where its item is, its text and its checked state. */
export interface CheckLine { pos: number; node: PMNode; title: string; checked: boolean }

/**
 * The check-list lines the command turns (note-checklist-tasks D1): the one around an
 * empty selection, else every check-list item with text that the selection touches,
 * in document order; `more` counts those past MAX_LINES.
 */
export function checkLinesIn(state: EditorState): { lines: CheckLine[]; more: number } {
  if (state.selection.empty) {
    const one = checkLineAt(state)
    return { lines: one ? [one] : [], more: 0 }
  }
  const all: CheckLine[] = []
  const { from, to } = state.selection
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type !== schema.nodes.list_item) return true
    const title = (node.firstChild?.textContent ?? '').trim()
    if (node.attrs.checked !== null && title) all.push({ pos, node, title, checked: node.attrs.checked === true })
    return true
  })
  return { lines: all.slice(0, MAX_LINES), more: Math.max(0, all.length - MAX_LINES) }
}

/** Each line becomes a plain line holding a link to its task (`ids` in the order of `lines`), caret after the last. */
export function linesToLinks(state: EditorState, lines: readonly CheckLine[], ids: readonly string[], titles?: readonly string[]): Transaction {
  const tr = state.tr
  // From the last line up, so earlier positions hold.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    const first = line.node.firstChild as PMNode
    // A link node, as `[[` writes one: the stored document reads back the same (note-links D2).
    const ref = schema.nodes.ref.create({ href: `?task=${ids[i]}`, label: titles?.[i] || line.title })
    const para = schema.nodes.paragraph.create(null, ref)
    tr.setNodeMarkup(line.pos, undefined, { checked: null })
    tr.replaceWith(line.pos + 1, line.pos + 1 + first.nodeSize, para)
  }
  const last = lines[lines.length - 1]
  if (last) {
    const end = tr.mapping.map(last.pos + 1)
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(tr.doc.content.size, end + (tr.doc.nodeAt(end)?.nodeSize ?? 1) - 1))))
  }
  return tr
}
