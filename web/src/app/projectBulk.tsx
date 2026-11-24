// Archive several projects at once (OpenSpec change archive-several-projects, GitHub
// issue 1661): the All projects table's selection, on the model of the task lists and
// the Notes page (Ctrl or ⌘+click and Space tick a row, Shift extends, "Select projects"
// shows the boxes on touch), and its bar: the count, Archive and Clear. Archive asks
// first, as archiving one project does, and writes one batch with one Undo.
import { useState, type KeyboardEvent } from 'react'
import { archiveProjectsUndoable } from '../lib/undoActions'
import { t } from '../lib/i18n'
import { MenuItem } from '../ui'
import { act } from './actionError'
import { askBulkConfirm, SelectionBar } from './bulk/BulkActions'
import { showUndoToast } from './bulk/toastStore'
import { useSelection } from './selection'

const projectsWord = (n: number) => t('{n, plural, one {# project} other {# projects}}', { n })

/** Asks, then archives `ids` with their sub-projects as one batch with Undo; `onDone` clears the selection. */
function archiveTickedProjects(ids: readonly string[], onDone: () => void): void {
  if (ids.length === 0) return
  askBulkConfirm({
    title: t('Archive {projects}?', { projects: projectsWord(ids.length) }),
    body: t('They leave the sidebar with their sub-projects. You can unarchive them from Settings → Data.'),
    // Archiving is undone from Settings → Data: the neutral tone, as for one project.
    confirmLabel: t('Archive'), tone: 'default',
    onConfirm: () => act(archiveProjectsUndoable(ids).then((r) => {
      onDone()
      if (r.entry) showUndoToast(r.label, r.entry.id)
    })),
  })
}

/** A row's tick: its state, whether the boxes show, and the tick (a range with Shift). */
export interface ProjectTick { ticked: boolean; shown: boolean; onTick: (range: boolean) => void }

/**
 * The selection of the All projects table: `ids` are the listed rows in order; only
 * projects the user may archive (`tickable`) are ticked. Returns each row's tick, the
 * table's keys, the bar and "Select projects" for the page's menu.
 */
export function useProjectBulk(ids: readonly string[], tickable: (id: string) => boolean) {
  const selection = useSelection(ids, (id) => !tickable(id))
  const [selectMode, setSelectMode] = useState(false)
  const ticked = ids.filter((id) => selection.ticked.has(id))
  const showing = selectMode || ticked.length > 0
  const clear = () => { selection.clear(); setSelectMode(false) }

  const tickOf = (id: string): ProjectTick | undefined => (tickable(id) ? {
    ticked: selection.ticked.has(id), shown: showing,
    onTick: (range) => { if (range) selection.extendTo(id); else selection.toggle(id) },
  } : undefined)

  /** A key on the row of project `id`: true when the selection took it; `move` moves the focus by one row. */
  const onKey = (e: KeyboardEvent, id: string): { handled: boolean; move?: number } => {
    const mod = e.ctrlKey || e.metaKey
    if ((e.key === ' ' || e.key === 'x') && !mod && !e.altKey && !e.shiftKey) {
      if (tickable(id)) selection.toggle(id)
      return { handled: true }
    }
    if (e.shiftKey && !mod && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const next = ids[ids.indexOf(id) + (e.key === 'ArrowDown' ? 1 : -1)]
      if (!next) return { handled: true }
      if (ticked.length === 0 && tickable(id)) selection.toggle(id)
      selection.extendTo(next)
      return { handled: true, move: e.key === 'ArrowDown' ? 1 : -1 }
    }
    if (ticked.length === 0) return { handled: false }
    if (mod && e.key.toLowerCase() === 'a') { selection.selectAll(); return { handled: true } }
    if (mod || e.altKey) return { handled: false }
    if (e.key === 'Escape') { clear(); return { handled: true } }
    return { handled: false }
  }

  const bar = showing ? (
    <SelectionBar ids={ticked} onClear={clear} menuOpen={false} onMenuOpenChange={() => {}} onDone={selectMode ? clear : undefined}
      menu={(_, cls) => <button type="button" className={cls} onClick={() => archiveTickedProjects(ticked, selection.clear)} data-projects-archive>{t('Archive')}</button>} />
  ) : null
  const selectItem = <MenuItem label={t('Select projects')} icon="list-checks" onSelect={() => setSelectMode(true)} data-projects-select />
  return { tickOf, onKey, bar, selectItem, ticked }
}
