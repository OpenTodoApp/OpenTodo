// The notes editor core (OpenSpec change `collaborative-rich-text`): the
// ProseMirror schema for the supported node set, conversion between editor
// documents and the neutral model of lib/richtext.ts, keyboard shortcuts,
// Markdown input rules, and the binding between an editor state and a Yjs body.
// Loaded lazily together with app/NotesEditor.tsx; nothing here is in the
// initial bundle.
//
// The binding (design D6) is diff-based in both directions instead of using
// y-prosemirror: a local transaction updates the Yjs body with updateBody (which
// leaves unknown marks and nodes alone), and a remote merge becomes one replace
// step over the changed range, so ProseMirror maps the selection through it and
// the caret stays on its character.
import { chainCommands, exitCode, setBlockType, toggleMark, baseKeymap } from 'prosemirror-commands'
import { history, redo, undo } from 'prosemirror-history'
import { InputRule, inputRules, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules'
import { keymap } from 'prosemirror-keymap'
import { type Mark, type MarkType, type Node as PMNode, Schema, Slice, Fragment } from 'prosemirror-model'
import { liftListItem, sinkListItem, splitListItem, wrapInList } from 'prosemirror-schema-list'
import { type Command, EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state'
import type * as Y from 'yjs'
import { LINK_REL, safeHref } from './markdown'
import { MAX_DOC_CHARS, parseMarkdown, toModel, updateBody, type Marks, type RNode, type Run } from './richtext'
import { msg, translatedList } from './i18n'

// ---- schema ----

export const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', parseDOM: [{ tag: 'p' }], toDOM: () => ['p', 0] },
    heading: {
      group: 'block', content: 'inline*', defining: true, attrs: { level: { default: 1 } },
      parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
      toDOM: (n) => [`h${n.attrs.level}`, 0],
    },
    bullet_list: { group: 'block', content: 'list_item+', parseDOM: [{ tag: 'ul' }], toDOM: () => ['ul', 0] },
    ordered_list: {
      group: 'block', content: 'list_item+', attrs: { order: { default: 1 } },
      parseDOM: [{ tag: 'ol', getAttrs: (d) => ({ order: Number((d as HTMLElement).getAttribute('start') ?? 1) || 1 }) }],
      toDOM: (n) => (n.attrs.order === 1 ? ['ol', 0] : ['ol', { start: n.attrs.order }, 0]),
    },
    list_item: {
      content: 'paragraph block*', defining: true, attrs: { checked: { default: null } },
      parseDOM: [{
        tag: 'li', getAttrs: (d) => {
          const v = (d as HTMLElement).getAttribute('data-checked')
          return { checked: v === 'true' ? true : v === 'false' ? false : null }
        },
      }],
      toDOM: (n) => (n.attrs.checked === null ? ['li', 0] : ['li', { 'data-checked': String(n.attrs.checked), class: 'task-item' }, 0]),
    },
    text: { group: 'inline' },
    hard_break: { inline: true, group: 'inline', selectable: false, parseDOM: [{ tag: 'br' }], toDOM: () => ['br'] },
  },
  marks: {
    link: {
      attrs: { href: {} }, inclusive: false,
      parseDOM: [{ tag: 'a[href]', getAttrs: (d) => ({ href: (d as HTMLElement).getAttribute('href') ?? '' }) }],
      toDOM: (m) => ['a', { href: safeHref(m.attrs.href as string) ?? undefined, title: m.attrs.href, rel: LINK_REL, target: '_blank' }, 0],
    },
    strong: { parseDOM: [{ tag: 'strong' }, { tag: 'b' }], toDOM: () => ['strong', 0] },
    em: { parseDOM: [{ tag: 'em' }, { tag: 'i' }], toDOM: () => ['em', 0] },
    strike: { parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }], toDOM: () => ['s', 0] },
    code: { excludes: '_', parseDOM: [{ tag: 'code' }], toDOM: () => ['code', 0] },
  },
})

// ---- model <-> editor document ----

function marksOf(marks: readonly Mark[]): Marks {
  const out: Marks = {}
  for (const m of marks) out[m.type.name] = m.type.name === 'link' ? { href: m.attrs.href } : {}
  return out
}

function runsOfBlock(node: PMNode): Run[] {
  const runs: Run[] = []
  node.forEach((child) => {
    if (child.isText) runs.push({ text: child.text ?? '', marks: marksOf(child.marks) })
    else if (child.type.name === 'hard_break') runs.push({ text: '\n', marks: {} })
  })
  return runs
}

/** The neutral model of an editor document (what updateBody writes). */
export function pmToModel(doc: PMNode): RNode[] {
  const out: RNode[] = []
  doc.forEach((n) => out.push(nodeToModel(n)))
  return out
}

function nodeToModel(n: PMNode): RNode {
  const type = n.type.name as RNode['type']
  if (n.isTextblock) return { type, attrs: type === 'heading' ? { level: n.attrs.level } : {}, runs: runsOfBlock(n) }
  const content: RNode[] = []
  n.forEach((c) => content.push(nodeToModel(c)))
  const attrs = type === 'ordered_list' ? { order: n.attrs.order } : type === 'list_item' ? { checked: n.attrs.checked } : {}
  return { type, attrs, content }
}

function inline(runs: Run[] | undefined): PMNode[] {
  const out: PMNode[] = []
  for (const r of runs ?? []) {
    const marks = Object.entries(r.marks)
      .filter(([name]) => name in schema.marks)
      .map(([name, attrs]) => schema.marks[name].create(name === 'link' ? { href: (attrs as { href?: string }).href ?? '' } : null))
    r.text.split('\n').forEach((part, i) => {
      if (i > 0) out.push(schema.nodes.hard_break.create())
      if (part) out.push(schema.text(part, marks))
    })
  }
  return out
}

function modelToNode(n: RNode): PMNode | null {
  switch (n.type) {
    case 'heading':
      return schema.nodes.heading.create({ level: Math.min(6, Math.max(1, Number(n.attrs.level) || 1)) }, inline(n.runs))
    case 'bullet_list':
    case 'ordered_list': {
      const items = (n.content ?? []).map(modelToNode).filter((x): x is PMNode => !!x && x.type.name === 'list_item')
      if (items.length === 0) return null
      return schema.nodes[n.type].create(n.type === 'ordered_list' ? { order: Number(n.attrs.order) || 1 } : null, items)
    }
    case 'list_item': {
      const kids = (n.content ?? []).map(modelToNode).filter((x): x is PMNode => !!x)
      if (kids.length === 0 || kids[0].type.name !== 'paragraph') kids.unshift(schema.nodes.paragraph.create())
      return schema.nodes.list_item.create({ checked: typeof n.attrs.checked === 'boolean' ? n.attrs.checked : null }, kids)
    }
    default:
      return schema.nodes.paragraph.create(null, inline(n.runs))
  }
}

/** An editor document for a model; never empty, never invalid. */
export function modelToPm(nodes: RNode[]): PMNode {
  const blocks = nodes.map(modelToNode).filter((x): x is PMNode => !!x)
  if (blocks.length === 0) blocks.push(schema.nodes.paragraph.create())
  const doc = schema.nodes.doc.create(null, blocks)
  doc.check()
  return doc
}

// ---- remote changes ----

/** Meta key marking transactions that came from the document (not the user). */
export const remoteKey = new PluginKey('notes-remote')

/**
 * The transaction that turns `state` into `next` by replacing only the changed
 * range, so the selection (and an IME composition outside that range) survives.
 * Null when nothing differs.
 */
export function remoteTransaction(state: EditorState, next: PMNode): Transaction | null {
  const cur = state.doc
  const start = cur.content.findDiffStart(next.content)
  if (start === null || start === undefined) return null
  let { a: endA, b: endB } = cur.content.findDiffEnd(next.content) ?? { a: cur.content.size, b: next.content.size }
  const overlap = start - Math.min(endA, endB)
  if (overlap > 0) {
    endA += overlap
    endB += overlap
  }
  const tr = state.tr.replace(start, endA, next.slice(start, endB))
  tr.setMeta(remoteKey, true).setMeta('addToHistory', false)
  return tr
}

/** Apply the body's current content to an editor state (after a merge). */
export function applyBody(state: EditorState, body: Y.XmlFragment): Transaction | null {
  return remoteTransaction(state, modelToPm(toModel(body)))
}

/** Write a local editor change into the body (call inside a Yjs transaction). */
export function writeBody(body: Y.XmlFragment, doc: PMNode): void {
  updateBody(body, pmToModel(doc))
}

// ---- size limit ----

/** Bytes an edit may add to the encoded document, estimated pessimistically. */
export function growthEstimate(before: PMNode, after: PMNode): number {
  const added = after.textContent.length - before.textContent.length + (after.content.size - before.content.size)
  // UTF-8 (up to 3 bytes per UTF-16 unit), Yjs item overhead, base64 (4/3).
  return added > 0 ? Math.ceil(added * 4 * 4 / 3) + 64 : 0
}

/**
 * Refuse input that would push the encoded note past the cap (design: "Document
 * size limits"). `size()` is the current envelope length; deletions are always
 * allowed so an oversized note can be trimmed.
 */
export function sizeLimit(size: () => number, cap = MAX_DOC_CHARS): Plugin {
  return new Plugin({
    filterTransaction: (tr, state) => {
      if (!tr.docChanged || tr.getMeta(remoteKey)) return true
      return size() + growthEstimate(state.doc, tr.doc) <= cap
    },
  })
}

// ---- commands, shortcuts, input rules ----

/** Toggle the checked state of the check-list item around the selection (or make it one). */
export const toggleCheck: Command = (state, dispatch) => {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type === schema.nodes.list_item) {
      if (dispatch) dispatch(state.tr.setNodeMarkup($from.before(d), undefined, { checked: node.attrs.checked === true ? false : true }))
      return true
    }
  }
  return false
}

function listDepth(state: EditorState): number {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    const item = $from.node(d).type
    if (item === schema.nodes.bullet_list || item === schema.nodes.ordered_list) return d
  }
  return -1
}

/** Give every plain item of the list around the selection a checkbox. */
function checkItems(tr: Transaction): Transaction {
  const state = EditorState.create({ doc: tr.doc, selection: tr.selection })
  const d = listDepth(state)
  if (d < 0) return tr
  const list = state.selection.$from.node(d)
  let pos = state.selection.$from.start(d)
  list.forEach((item) => {
    if (item.attrs.checked === null) tr.setNodeMarkup(pos, undefined, { checked: false })
    pos += item.nodeSize
  })
  return tr
}

/** Make the selection a check list: wrap it in a bullet list, then add checkboxes. */
export const wrapInCheckList: Command = (state, dispatch) => {
  if (listDepth(state) >= 0) {
    if (dispatch) dispatch(checkItems(state.tr))
    return true
  }
  return wrapInList(schema.nodes.bullet_list)(state, dispatch && ((tr) => dispatch(checkItems(tr))))
}

/**
 * Ask for a URL and link the selection; an empty answer removes the link, null
 * cancels. The answer may come later (the app's link dialog): it then applies to
 * the editor's selection at that time, which ProseMirror has mapped through any
 * change made meanwhile (a remote merge), and focus returns to the editor.
 */
export function linkCommand(ask: (current: string) => string | null | Promise<string | null>): Command {
  return (state, dispatch, view) => {
    const type = schema.marks.link
    const { from, to, empty } = state.selection
    if (empty) return false
    if (!dispatch) return true
    let current = ''
    state.doc.nodesBetween(from, to, (n) => {
      const m = type.isInSet(n.marks)
      if (m) current = m.attrs.href as string
    })
    const apply = (href: string | null, at: EditorState, send: (tr: Transaction) => void) => {
      if (href === null || at.selection.empty) return
      const tr = at.tr.removeMark(at.selection.from, at.selection.to, type)
      if (href.trim()) tr.addMark(at.selection.from, at.selection.to, type.create({ href: href.trim() }))
      send(tr)
    }
    const answer = ask(current)
    if (answer instanceof Promise) {
      void answer.then((href) => {
        if (!view || view.isDestroyed) return
        apply(href, view.state, (tr) => view.dispatch(tr))
        view.focus()
      })
      return true
    }
    apply(answer, state, dispatch)
    return true
  }
}

const mod = typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform) ? 'Cmd' : 'Ctrl'

/** Keyboard shortcuts, listed for the help overlay (`keys` use ProseMirror names). */
export const SHORTCUTS: { keys: string; label: string }[] = translatedList([
  { keys: 'Mod-b', label: msg('Bold') },
  { keys: 'Mod-i', label: msg('Italic') },
  { keys: 'Mod-Shift-x', label: msg('Strikethrough') },
  { keys: 'Mod-e', label: msg('Inline code') },
  { keys: 'Mod-k', label: msg('Link') },
  { keys: 'Mod-Alt-1', label: msg('Heading 1 (2, 3 for smaller)') },
  { keys: 'Mod-Alt-0', label: msg('Normal text') },
  { keys: 'Mod-Shift-8', label: msg('Bullet list') },
  { keys: 'Mod-Shift-7', label: msg('Numbered list') },
  { keys: 'Mod-Shift-9', label: msg('Check list') },
  { keys: 'Mod-Enter', label: msg('Check / uncheck item') },
  { keys: 'Tab', label: msg('Indent list item (Shift-Tab: outdent)') },
  { keys: 'Shift-Enter', label: msg('Line break') },
  { keys: 'Mod-z', label: msg('Undo (Mod-Shift-z: redo)') },
  { keys: 'Escape', label: msg('Leave the notes') },
], 'label')

/** A shortcut as shown to people: Mod becomes Ctrl or Cmd. */
export function shortcutLabel(keys: string): string {
  return keys.replace('Mod', mod).replace(/-/g, '+')
}

/**
 * `**bold**`, `*em*`, `~~strike~~`, `` `code` `` typed inline become marks. A
 * rule may match one boundary character before the opening delimiter; it is kept.
 */
function markRule(re: RegExp, type: MarkType, delim: number): InputRule {
  return new InputRule(re, (state, match, start, end) => {
    const text = match[1]
    if (!text) return null
    const from = start + (match[0].length - text.length - 2 * delim)
    const marks = [...(state.storedMarks ?? state.doc.resolve(from).marks()), type.create()]
    const tr = state.tr.replaceWith(from, end, schema.text(text, marks))
    tr.removeStoredMark(type)
    return tr
  })
}

function rules(): Plugin {
  const { nodes, marks } = schema
  return inputRules({
    rules: [
      textblockTypeInputRule(/^(#{1,6})\s$/, nodes.heading, (m) => ({ level: m[1].length })),
      new InputRule(/^\[([ xX])\]\s$/, (state, match, start, end) => {
        // "[ ] " or "[x] " at the start of a list item makes it a check item.
        const $s = state.doc.resolve(start)
        for (let d = $s.depth; d > 0; d--) {
          if ($s.node(d).type === nodes.list_item) {
            return state.tr.delete(start, end).setNodeMarkup($s.before(d), undefined, { checked: match[1] !== ' ' })
          }
        }
        return null
      }),
      wrappingInputRule(/^\s*([-+*])\s$/, nodes.bullet_list),
      wrappingInputRule(/^(\d+)[.)]\s$/, nodes.ordered_list, (m) => ({ order: Number(m[1]) }), (m, n) => n.childCount + n.attrs.order === Number(m[1])),
      markRule(/\*\*([^*]+)\*\*$/, marks.strong, 2),
      markRule(/(?:^|[^*\w])\*([^*\s][^*]*)\*$/, marks.em, 1),
      markRule(/(?:^|[^_\w])_([^_\s][^_]*)_$/, marks.em, 1),
      markRule(/~~([^~]+)~~$/, marks.strike, 2),
      markRule(/`([^`]+)`$/, marks.code, 1),
    ],
  })
}

export interface EditorHooks {
  /** Ask for a link URL: null cancels, '' removes the link (the app answers from its link dialog, later). */
  askLink: (current: string) => string | null | Promise<string | null>
  /** Leave the editor (Escape). */
  onEscape: () => void
  /** Current encoded size, for the input cap. */
  size: () => number
  /** Shown while the note is empty. */
  placeholder?: string
}

const isEmpty = (doc: PMNode) => doc.childCount === 1 && doc.firstChild?.type === schema.nodes.paragraph && doc.firstChild.content.size === 0

/** Marks the editor `is-empty` (with data-placeholder) so CSS can show a hint. */
function placeholder(text: string): Plugin {
  return new Plugin({
    props: { attributes: (state): Record<string, string> => (text && isEmpty(state.doc) ? { class: 'is-empty', 'data-placeholder': text } : {}) },
  })
}

/** Every plugin of the notes editor. */
export function plugins(hooks: EditorHooks): Plugin[] {
  const { nodes, marks } = schema
  const lineBreak: Command = chainCommands(exitCode, (state, dispatch) => {
    if (dispatch) dispatch(state.tr.replaceSelectionWith(nodes.hard_break.create()).scrollIntoView())
    return true
  })
  return [
    placeholder(hooks.placeholder ?? ''),
    sizeLimit(hooks.size),
    rules(),
    keymap({
      'Mod-z': undo, 'Mod-Shift-z': redo, 'Mod-y': redo,
      'Mod-b': toggleMark(marks.strong), 'Mod-i': toggleMark(marks.em), 'Mod-Shift-x': toggleMark(marks.strike),
      'Mod-e': toggleMark(marks.code), 'Mod-k': linkCommand(hooks.askLink),
      'Mod-Alt-0': setBlockType(nodes.paragraph),
      'Mod-Alt-1': setBlockType(nodes.heading, { level: 1 }), 'Mod-Alt-2': setBlockType(nodes.heading, { level: 2 }),
      'Mod-Alt-3': setBlockType(nodes.heading, { level: 3 }),
      'Mod-Shift-8': wrapInList(nodes.bullet_list), 'Mod-Shift-7': wrapInList(nodes.ordered_list), 'Mod-Shift-9': wrapInCheckList,
      'Mod-Enter': toggleCheck,
      Enter: splitListItem(nodes.list_item), Tab: sinkListItem(nodes.list_item), 'Shift-Tab': liftListItem(nodes.list_item),
      'Shift-Enter': lineBreak,
      Escape: () => {
        hooks.onEscape()
        return true
      },
    }),
    keymap(baseKeymap),
    history(),
  ]
}

/** A fresh editor state for a model. */
export function createState(nodes: RNode[], hooks: EditorHooks): EditorState {
  return EditorState.create({ doc: modelToPm(nodes), plugins: plugins(hooks) })
}

/** Pasted plain text is read as Markdown, so pasting a formatted note keeps its structure. */
export function markdownSlice(text: string): Slice {
  const doc = modelToPm(parseMarkdown(text))
  return new Slice(Fragment.from(doc.content), 1, 1)
}
