// Tables in the editor (OpenSpec change editor-everywhere, design D3, D4):
// prosemirror-tables gives cell selection, Tab navigation and the row and column
// commands; this module adds the limits (10 columns, 100 rows) so the editor
// never produces a table the Markdown projection cannot hold. Lazy chunk only.
import type { Node as PMNode } from 'prosemirror-model'
import { type Command, Plugin, TextSelection } from 'prosemirror-state'
import {
  addColumnAfter, addColumnBefore, addRowAfter, addRowBefore, deleteColumn, deleteRow, deleteTable, goToNextCell, isInTable,
  selectedRect, tableEditing, toggleHeaderRow,
} from 'prosemirror-tables'
import { MAX_TABLE_COLS, MAX_TABLE_ROWS } from './richtextMarkdown'
import { remoteKey, schema } from './richtextEditor'
import { t } from './i18n'

export { isInTable }

/** Columns and rows of a table node. */
function shape(table: PMNode): { cols: number; rows: number } {
  let cols = 0
  table.forEach((row) => {
    cols = Math.max(cols, row.childCount)
  })
  return { cols, rows: table.childCount }
}

function tooBig(doc: PMNode): boolean {
  let over = false
  doc.descendants((n) => {
    if (over) return false
    if (n.type === schema.nodes.table) {
      const s = shape(n)
      if (s.cols > MAX_TABLE_COLS || s.rows > MAX_TABLE_ROWS) over = true
      return false
    }
    return true
  })
  return over
}

/** Refuse any local change that leaves a table past the limits (a paste, a command). */
export function tableLimits(): Plugin {
  return new Plugin({
    filterTransaction: (tr) => !tr.docChanged || !!tr.getMeta(remoteKey) || !tooBig(tr.doc),
  })
}

/** The cell editing plugin of prosemirror-tables (cell selection, fixing rows). */
export function tablePlugins(): Plugin[] {
  return [tableEditing({ allowTableNodeSelection: false }), tableLimits()]
}

/**
 * Insert a table with a header row and `rows - 1` body rows, the caret in the
 * first header cell. Refused inside a table or a list item's nested content.
 */
export function insertTable(cols = 2, rows = 2): Command {
  return (state, dispatch) => {
    if (isInTable(state)) return false
    const { table, table_row, table_header, table_cell, paragraph } = schema.nodes
    const row = (cell: typeof table_cell) => table_row.create(null, Array.from({ length: cols }, () => cell.create()))
    const node = table.create(null, [row(table_header), ...Array.from({ length: rows - 1 }, () => row(table_cell))])
    const { $from } = state.selection
    // Replace an empty paragraph, else insert after the current block.
    const empty = $from.parent.type === paragraph && $from.parent.content.size === 0
    const at = empty ? $from.before() : $from.after(Math.max(1, $from.depth))
    if (!dispatch) return true
    const tr = empty ? state.tr.replaceWith(at, $from.after(), node) : state.tr.insert(at, node)
    // Caret in the first header cell: table > row > cell > text.
    tr.setSelection(TextSelection.create(tr.doc, at + 3))
    dispatch(tr.scrollIntoView())
    return true
  }
}

/** Run a row or column command unless it would pass a limit; `notify` says which. */
function limited(cmd: Command, axis: 'cols' | 'rows', notify: (message: string) => void): Command {
  return (state, dispatch, view) => {
    if (!isInTable(state)) return false
    const rect = selectedRect(state)
    const s = { cols: rect.map.width, rows: rect.map.height }
    if (axis === 'cols' && s.cols >= MAX_TABLE_COLS) {
      if (dispatch) notify(t('A table can have at most {count} columns.', { count: MAX_TABLE_COLS }))
      return !!dispatch
    }
    if (axis === 'rows' && s.rows >= MAX_TABLE_ROWS) {
      if (dispatch) notify(t('A table can have at most {count} rows.', { count: MAX_TABLE_ROWS }))
      return !!dispatch
    }
    return cmd(state, dispatch, view)
  }
}

export interface TableCommand {
  id: string
  /** The command, given a way to say why it did nothing. */
  command: (notify: (message: string) => void) => Command
}

/** Row and column commands, for the slash menu and the cell's context menu. */
export const TABLE_COMMANDS: TableCommand[] = [
  { id: 'row-before', command: (n) => limited(addRowBefore, 'rows', n) },
  { id: 'row-after', command: (n) => limited(addRowAfter, 'rows', n) },
  { id: 'col-before', command: (n) => limited(addColumnBefore, 'cols', n) },
  { id: 'col-after', command: (n) => limited(addColumnAfter, 'cols', n) },
  { id: 'delete-row', command: () => deleteRow },
  { id: 'delete-col', command: () => deleteColumn },
  { id: 'toggle-header', command: () => toggleHeaderRow },
  { id: 'delete-table', command: () => deleteTable },
]

/** Tab moves to the next cell, adding a row after the last one (within the limit). */
export function tableTab(notify: (message: string) => void): Command {
  return (state, dispatch, view) => {
    if (!isInTable(state)) return false
    if (goToNextCell(1)(state, dispatch, view)) return true
    return limited((s, d, v) => addRowAfter(s, d && ((tr) => {
      d(tr)
      if (v) goToNextCell(1)(v.state, v.dispatch, v)
    })), 'rows', notify)(state, dispatch, view)
  }
}

export const tableShiftTab: Command = (state, dispatch, view) => isInTable(state) && goToNextCell(-1)(state, dispatch, view)
