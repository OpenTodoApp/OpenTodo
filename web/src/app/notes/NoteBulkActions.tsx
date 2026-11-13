// Actions on ticked notes (OpenSpec change notes-bulk-actions, D2 to D4): the Notes
// page's selection (the task lists' model, over standalone notes the user may write),
// its bar and its Actions menu: Move to project (reviewed when a note would change
// sharing scope), Labels, Pin or Unpin, Turn into tasks and Move to Trash. Each action
// is one batch with one Undo toast.
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { allPinned, labelNotes, moveNotes, notesChangingScope, notesToTasks, pinNotes, trashNotes, type NoteBulkResult } from '../../lib/noteBulk'
import { itemKeywords, projectSource, type PickerItem } from '../../lib/pickerSources'
import { keysOf } from '../../lib/shortcuts'
import type { Label, Membership, Project } from '../../lib/types'
import { t } from '../../lib/i18n'
import { useSelection, type SelectionApi } from '../selection'
import { askBulkConfirm, BULK_TRASH_CONFIRM_ABOVE, SelectionBar, TRASH_TOAST_MS } from '../bulk/BulkActions'
import { showBulkToast } from '../bulk/toastStore'
import { ActionMenu, type ActionGroup, type ConfirmSpec } from '../menus/ActionMenu'
import { navigate } from '../router'
import { act } from '../actionError'
import { MenuItem } from '../../ui'
import type { NoteEntry } from '../../lib/noteList'
import { canEditTasks, roleOf } from '../../lib/sharing'

const notesWord = (n: number) => t('{n, plural, one {# note} other {# notes}}', { n })

/** Shows a bulk action's toast: Undo, and for the Trash a longer offer with Show Trash. */
function toast(r: NoteBulkResult, trash = false): void {
  if (trash) showBulkToast(r.label, r.undoId, { ttl: TRASH_TOAST_MS, action: { label: t('Show Trash'), run: () => navigate({ view: 'trash' }) } })
  else showBulkToast(r.label, r.undoId)
}

/** Move to Trash, asking first above twenty (D3, as for tasks). */
export function trashTickedNotes(ids: readonly string[], onDone: () => void): void {
  const run = () => act(trashNotes(ids).then((r) => { onDone(); toast(r, true) }))
  if (ids.length > BULK_TRASH_CONFIRM_ABOVE) {
    askBulkConfirm({ title: t('Move {notes} to the Trash?', { notes: notesWord(ids.length) }), body: t('You can restore them from the Trash.'), confirmLabel: t('Move to Trash'), tone: 'danger', onConfirm: run })
  } else run()
}

/** Pin every ticked note, or Unpin them when all are pinned (D3). */
export function pinTickedNotes(ids: readonly string[], favourites: string | undefined): void {
  act(pinNotes(ids, !allPinned(ids, favourites)).then((r) => toast(r)))
}

/** The selection of the Notes page (D1, D2): `keys` in list order; only `tickable` keys are ticked. */
export interface NoteSelection {
  selection: SelectionApi
  /** Ticked note ids (standalone notes), in list order. */
  ids: string[]
  /** The checkboxes show: something is ticked, or Select notes is on. */
  showing: boolean
  selectMode: boolean
  setSelectMode: (on: boolean) => void
  clear: () => void
}

export function useNoteSelection(keys: readonly string[], tickable: (key: string) => boolean): NoteSelection {
  const selection = useSelection(keys, (k) => !tickable(k))
  const [selectMode, setSelectMode] = useState(false)
  const ids = useMemo(() => keys.filter((k) => selection.ticked.has(k)).map((k) => k.slice('note:'.length)), [keys, selection.ticked])
  return {
    selection, ids, selectMode, setSelectMode,
    showing: selectMode || selection.ticked.size > 0,
    clear: () => { selection.clear(); setSelectMode(false) },
  }
}

/** The groups of the Actions menu for `ids` (D3), each with its key. */
export function noteBulkGroups(ids: readonly string[], d: { projects: readonly Project[]; labels: readonly Label[]; memberships: Map<string, Membership>; favourites?: string; onDone: () => void }): ActionGroup[] {
  const n = ids.length
  const live = d.labels.filter((l) => !l.deleted_at)
  const after = (p: Promise<NoteBulkResult>, trash = false) => act(p.then((r) => { d.onDone(); toast(r, trash) }))
  const move = async (projectId: string | null, name: string): Promise<ConfirmSpec | void> => {
    const changing = await notesChangingScope(ids, projectId)
    // Only a move into another sharing scope is reviewed (bulk-actions "Moves and assignments are reviewed first").
    if (changing.length === 0) return void after(moveNotes(ids, projectId, name))
    return {
      title: t('Move {notes} to {project}', { notes: notesWord(n), project: name }),
      body: (
        <ul className="space-y-1" data-note-move-review>
          {changing.map((x) => <li key={x.id}><span className="user-text font-medium">{x.title.trim() || t('Untitled note')}</span> <span className="text-muted">{t('copied into {project}', { project: name })}</span></li>)}
        </ul>
      ),
      confirmLabel: t('Move'),
      onConfirm: () => after(moveNotes(ids, projectId, name)),
    }
  }
  return [
    { items: [
      { kind: 'picker', id: 'move', label: t('Move to project'), icon: 'folder-input', shortcut: keysOf('notes.move'), picker: {
        title: t('Move to project'), placeholder: t('Find a project…'), source: projectSource(d.projects.filter((p) => !p.deleted_at && !p.archived), { memberships: d.memberships, inbox: false }),
        getKey: (i: PickerItem) => i.key, getLabel: (i: PickerItem) => i.label, getPath: (i: PickerItem) => i.path, getKeywords: itemKeywords, rankContext: 'note.project',
        onPick: (i: PickerItem) => move(i.value ? String(i.value) : null, i.label),
      } },
      { kind: 'picker', id: 'labels', label: t('Labels'), icon: 'tag', shortcut: keysOf('list.labels'), disabled: live.length === 0, reason: t('There are no labels yet'), picker: {
        title: t('Labels'), placeholder: t('Add to all, or remove from all…'), source: live, rankContext: 'label',
        getKey: (l: Label) => l.id, getLabel: (l: Label) => l.name,
        onPick: (l: Label) => after(labelNotes(ids, l.id, l.name)),
      } },
      allPinned(ids, d.favourites)
        ? { kind: 'action', id: 'unpin', label: t('Unpin'), icon: 'pin-off', shortcut: keysOf('notes.pin'), onSelect: () => pinTickedNotes(ids, d.favourites) }
        : { kind: 'action', id: 'pin', label: t('Pin'), icon: 'pin', shortcut: keysOf('notes.pin'), onSelect: () => pinTickedNotes(ids, d.favourites) },
      { kind: 'action', id: 'to-tasks', label: t('Turn into tasks'), icon: 'circle-check-big', onSelect: () => after(notesToTasks(ids)) },
    ] },
    { items: [n > BULK_TRASH_CONFIRM_ABOVE
      ? { kind: 'confirm', id: 'trash', label: t('Move to Trash'), icon: 'trash-2', shortcut: keysOf('list.delete').split(' / ')[0], tone: 'danger', confirm: {
        title: t('Move {notes} to the Trash?', { notes: notesWord(n) }), body: t('You can restore them from the Trash.'), confirmLabel: t('Move to Trash'), tone: 'danger',
        onConfirm: () => after(trashNotes(ids), true),
      } }
      : { kind: 'action', id: 'trash', label: t('Move to Trash'), icon: 'trash-2', shortcut: keysOf('list.delete').split(' / ')[0], tone: 'danger', onSelect: () => after(trashNotes(ids), true) }] },
  ]
}

/** The Actions menu for the ticked notes (`.`, or the bar's Actions button), titled with the count. */
export function NoteBulkMenu({ ids, open, onOpenChange, startPicker, trigger, triggerClassName, ...data }: {
  ids: readonly string[]; open: boolean; onOpenChange: (open: boolean) => void; startPicker?: string | null
  trigger: ReactNode; triggerClassName: string
  projects: readonly Project[]; labels: readonly Label[]; memberships: Map<string, Membership>; favourites?: string; onDone: () => void
}) {
  const groups = noteBulkGroups(ids, data)
  return (
    <ActionMenu label={t('Actions for {notes}', { notes: notesWord(ids.length) })} title={notesWord(ids.length)} groups={groups} open={open} onOpenChange={onOpenChange}
      startPicker={startPicker} trigger={trigger} triggerClassName={triggerClassName} width="sm:w-72" />
  )
}

/** The bar while notes are ticked (or Select notes is on): the count, Actions and Clear, as on task lists. */
export function NoteSelectionBar({ sel, menuOpen, onMenuOpenChange, startPicker, ...data }: {
  sel: NoteSelection; menuOpen: boolean; onMenuOpenChange: (open: boolean) => void; startPicker?: string | null
  projects: readonly Project[]; labels: readonly Label[]; memberships: Map<string, Membership>; favourites?: string
}) {
  if (!sel.showing) return null
  return (
    <SelectionBar ids={sel.ids} onClear={sel.clear} menuOpen={menuOpen} onMenuOpenChange={onMenuOpenChange} onDone={sel.selectMode ? sel.clear : undefined}
      menu={(trigger, cls) => <NoteBulkMenu ids={sel.ids} open={menuOpen} onOpenChange={onMenuOpenChange} startPicker={startPicker} trigger={trigger} triggerClassName={cls} onDone={sel.selection.clear} {...data} />} />
  )
}

/**
 * Everything the Notes page needs for its selection (D1 to D3): the selection over the
 * listed rows' keys, the list keys while notes are ticked, each row's tick props, the
 * bar, and Select notes for the header's menu. Cleared when `enabled` turns off (Graph mode).
 */
export function useNoteBulk({ rows, ...o }: {
  /** The listed rows, in order. */
  rows: readonly Pick<NoteEntry, 'key' | 'source' | 'projectId'>[]; enabled: boolean
  projects: readonly Project[]; labels: readonly Label[]; memberships: Map<string, Membership>; favourites?: string
}) {
  const order = rows.map((r) => r.key).join()
  const keys = useMemo(() => rows.map((r) => r.key), [order]) // eslint-disable-line react-hooks/exhaustive-deps -- the keys in order
  const projectOf = new Map(rows.map((r) => [r.key, r.projectId]))
  // Standalone notes the user may write (D1).
  const tickable = (k: string) => k.startsWith('note:') && canEditTasks(roleOf(projectOf.get(k) ?? null, o.memberships))
  const sel = useNoteSelection(keys, tickable)
  const [menuOpen, setMenuOpen] = useState(false)
  const [picker, setPicker] = useState<string | null>(null)
  const { clear } = sel
  useEffect(() => { if (!o.enabled) clear() }, [o.enabled]) // eslint-disable-line react-hooks/exhaustive-deps -- only when the mode changes
  const ticked = sel.selection.ticked.size > 0
  const openMenu = (p: string | null = null) => { setPicker(p); setMenuOpen(true) }
  /**
   * A key on the list row `key` (bulk-actions keys, D3): handled is true when the key
   * acted; `move` asks the list to move the focus by one row (a Shift+arrow extension).
   */
  const onKey = (e: KeyboardEvent, key: string): { handled: boolean; move?: number } => {
    const mod = e.ctrlKey || e.metaKey
    const at = keys.indexOf(key)
    if ((e.key === 'x' || e.key === ' ') && !mod && !e.altKey && !e.shiftKey) {
      if (!tickable(key)) return { handled: true }
      sel.selection.toggle(key)
      return { handled: true }
    }
    if (e.shiftKey && !mod && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const next = keys[at + (e.key === 'ArrowDown' ? 1 : -1)]
      if (!next) return { handled: true }
      if (!ticked && tickable(key)) sel.selection.toggle(key)
      sel.selection.extendTo(next)
      return { handled: true, move: e.key === 'ArrowDown' ? 1 : -1 }
    }
    if (!ticked) return { handled: false }
    if (mod && e.key.toLowerCase() === 'a') { sel.selection.selectAll(); return { handled: true } }
    if (mod || e.altKey) return { handled: false }
    if (e.key === 'Escape') { sel.clear(); return { handled: true } }
    if (e.key === '.') { openMenu(); return { handled: true } }
    if (e.key === 'm') { openMenu('move'); return { handled: true } }
    if (e.key === 'L' && e.shiftKey) { openMenu('labels'); return { handled: true } }
    if (e.key === 'p') { pinTickedNotes(sel.ids, o.favourites); return { handled: true } }
    if (e.key === 'Delete' || e.key === 'Backspace') { trashTickedNotes(sel.ids, sel.selection.clear); return { handled: true } }
    return { handled: false }
  }
  const tickOf = (key: string) => (tickable(key) ? {
    ticked: sel.selection.ticked.has(key), shown: sel.showing,
    onTick: (range: boolean) => { if (range) sel.selection.extendTo(key); else sel.selection.toggle(key) },
  } : undefined)
  const bar = <NoteSelectionBar sel={sel} menuOpen={menuOpen} onMenuOpenChange={(v) => { setMenuOpen(v); if (!v) setPicker(null) }} startPicker={picker}
    projects={o.projects} labels={o.labels} memberships={o.memberships} favourites={o.favourites} />
  const selectItem = <MenuItem label={t('Select notes')} icon="list-checks" onSelect={() => sel.setSelectMode(true)} data-notes-select />
  /** The list's keydown on its row buttons `all`, focus on `at`: true when the selection took the key. */
  const onListKey = (e: KeyboardEvent, all: HTMLElement[], at: number): boolean => {
    const r = onKey(e, all[at].closest('[data-note-key]')?.getAttribute('data-note-key') ?? '')
    if (!r.handled) return false
    e.preventDefault()
    e.stopPropagation()
    if (r.move) all[at + r.move]?.focus()
    return true
  }
  return { sel, onKey, onListKey, tickOf, bar, selectItem, ticked }
}
