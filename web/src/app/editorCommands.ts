// The editor's commands (OpenSpec change editor-everywhere, design D9): one list
// behind the `/` menu, the touch toolbar's More menu and the table's context
// menu, so every action is reachable from the keyboard and works the same in
// the notes and in the comment composer. Lazy chunk only.
import { setBlockType, toggleMark, wrapIn } from 'prosemirror-commands'
import { wrapInList } from 'prosemirror-schema-list'
import type { Command } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { formatDate } from '../lib/dates'
import { checkLineAt } from '../lib/editorNotes'
import { insertTable, isInTable, TABLE_COMMANDS } from '../lib/editorTables'
import { linkCommand, schema, wrapInCheckList } from '../lib/richtextEditor'
import { logicalToday } from '../lib/dates'
import { t } from '../lib/i18n'
import type { IconName } from '../ui'

/** What a command may use besides the editor. */
export interface CommandEnv {
  /** The notes of a task: Make subtask is offered. */
  notes: boolean
  /** Members to mention (a shared project). */
  members: boolean
  askLink: (current: string) => string | null | Promise<string | null>
  /** Choose an image file and embed it (notes and comments of a task). */
  pickImage?: () => void
  makeSubtask?: Command
  notify: (message: string) => void
}

export interface EditorCommand {
  id: string
  label: string
  icon: IconName
  /** Extra words the `/` filter matches. */
  keywords?: string
  available?: (view: EditorView, env: CommandEnv) => boolean
  run: (view: EditorView, env: CommandEnv) => void
}

const exec = (cmd: Command) => (view: EditorView) => {
  cmd(view.state, view.dispatch, view)
  view.focus()
}

/** Ask for an address: with a selection it links the text, else it inserts the address as a link. */
function link(view: EditorView, env: CommandEnv): void {
  if (!view.state.selection.empty) {
    exec(linkCommand(env.askLink))(view)
    return
  }
  void Promise.resolve(env.askLink('')).then((href) => {
    const url = href?.trim()
    if (!url || view.isDestroyed) return
    const mark = schema.marks.link.create({ href: url })
    view.dispatch(view.state.tr.replaceSelectionWith(schema.text(url, [mark]), false).scrollIntoView())
    view.focus()
  })
}

/** Today in the user's date format, as text. */
function insertDate(view: EditorView): void {
  const text = formatDate(logicalToday(), 'long')
  view.dispatch(view.state.tr.insertText(text).scrollIntoView())
  view.focus()
}

const tableLabel = (id: string): { label: string; icon: IconName } => ({
  'row-before': { label: t('Add row above'), icon: 'arrow-up' as IconName },
  'row-after': { label: t('Add row below'), icon: 'arrow-down' as IconName },
  'col-before': { label: t('Add column before'), icon: 'arrow-left' as IconName },
  'col-after': { label: t('Add column after'), icon: 'arrow-right' as IconName },
  'delete-row': { label: t('Delete row'), icon: 'minus' as IconName },
  'delete-col': { label: t('Delete column'), icon: 'minus' as IconName },
  'toggle-header': { label: t('Header row on or off'), icon: 'table' as IconName },
  'delete-table': { label: t('Delete table'), icon: 'trash-2' as IconName },
})[id] ?? { label: id, icon: 'table' }

/** The table's row and column commands (only while the caret is in a table). */
export function tableCommands(): EditorCommand[] {
  return TABLE_COMMANDS.map((c) => ({
    id: `table.${c.id}`, ...tableLabel(c.id), keywords: 'table row column',
    available: (view) => isInTable(view.state),
    run: (view, env) => exec(c.command(env.notify))(view),
  }))
}

/** Every command, in menu order. */
export function editorCommands(): EditorCommand[] {
  const { nodes, marks } = schema
  return [
    { id: 'h1', label: t('Heading 1'), icon: 'heading-1', keywords: 'title h1', run: exec(setBlockType(nodes.heading, { level: 1 })) },
    { id: 'h2', label: t('Heading 2'), icon: 'heading-2', keywords: 'h2', run: exec(setBlockType(nodes.heading, { level: 2 })) },
    { id: 'h3', label: t('Heading 3'), icon: 'heading-3', keywords: 'h3', run: exec(setBlockType(nodes.heading, { level: 3 })) },
    { id: 'bullet', label: t('Bullet list'), icon: 'list', keywords: 'ul unordered', run: exec(wrapInList(nodes.bullet_list)) },
    { id: 'numbered', label: t('Numbered list'), icon: 'list-ordered', keywords: 'ol ordered', run: exec(wrapInList(nodes.ordered_list)) },
    { id: 'checklist', label: t('Checklist'), icon: 'list-checks', keywords: 'todo check task', run: exec(wrapInCheckList) },
    { id: 'table', label: t('Table'), icon: 'table', keywords: 'grid', available: (view) => !isInTable(view.state), run: exec(insertTable(2, 2)) },
    ...tableCommands(),
    { id: 'quote', label: t('Quote'), icon: 'text-quote', keywords: 'blockquote', run: exec(wrapIn(nodes.blockquote)) },
    { id: 'code', label: t('Code block'), icon: 'code', keywords: 'pre fence', run: exec(setBlockType(nodes.code_block)) },
    { id: 'link', label: t('Link'), icon: 'link', keywords: 'url address', run: link },
    { id: 'image', label: t('Image'), icon: 'image', keywords: 'picture photo screenshot', available: (_v, env) => !!env.pickImage, run: (_v, env) => env.pickImage?.() },
    { id: 'date', label: t('Date'), icon: 'calendar-days', keywords: 'today', run: insertDate },
    {
      id: 'mention', label: t('Mention'), icon: 'at-sign', keywords: 'member person', available: (_v, env) => env.members,
      run: (view) => {
        view.dispatch(view.state.tr.insertText('@'))
        view.focus()
      },
    },
    {
      id: 'subtask', label: t('Make subtask'), icon: 'corner-down-right', keywords: 'task',
      available: (view, env) => env.notes && !!env.makeSubtask && !!checkLineAt(view.state),
      run: (view, env) => env.makeSubtask && exec(env.makeSubtask)(view),
    },
    { id: 'bold', label: t('Bold'), icon: 'bold', available: () => false, run: exec(toggleMark(marks.strong)) },
    { id: 'italic', label: t('Italic'), icon: 'italic', available: () => false, run: exec(toggleMark(marks.em)) },
    { id: 'strike', label: t('Strikethrough'), icon: 'strikethrough', keywords: 'strike', run: exec(toggleMark(marks.strike)) },
  ]
}

/** The commands the `/` menu offers for what was typed after the slash. */
export function filterCommands(all: EditorCommand[], query: string, view: EditorView, env: CommandEnv): EditorCommand[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return all.filter((c) => {
    if (c.available && !c.available(view, env)) return false
    const names = [...c.label.toLowerCase().split(/\s+/), ...(c.keywords ?? '').split(' ')]
    // Every typed word starts a word of the label or a keyword.
    return words.every((q) => names.some((w) => w.startsWith(q)))
  })
}
