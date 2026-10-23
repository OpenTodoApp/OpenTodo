// Command palette entries (OpenSpec change search-and-command-palette, design D2).
// One shape for everything the box lists: tasks, projects, labels, saved views,
// Settings sections, commands and filter-query results. Built on the device from
// the local tables, never persisted and never sent anywhere.
import type { ConfirmSpec, PickerSpec } from '../menus/ActionMenu'
import type { IconName } from '../../ui'
import { msg, translatedMap } from '../../lib/i18n'

export type EntryKind = 'command' | 'task' | 'project' | 'label' | 'view' | 'settings' | 'filter'

/** What a command may ask for after it is picked; the palette shows it in place. */
export type Step =
  // `any`: entries mix pickers of different item types.
  | { kind: 'picker'; picker: PickerSpec<any> }
  | { kind: 'confirm'; confirm: ConfirmSpec }
  | { kind: 'prompt'; title: string; label: string; initial: string; onSubmit: (value: string) => unknown }

export interface Entry {
  kind: EntryKind
  key: string
  label: string
  /** Project and due date of a task, a project's path, a section's description… */
  secondary?: string
  /** "completed", "archived": shown as a badge, ranked after the rest of its kind. */
  marker?: string
  icon?: IconName
  shortcut?: string
  /** Words the entry also matches on, never shown (the old name of a renamed page). */
  keywords?: string
  /** The group heading this entry is listed under when it is not its kind's ("Recent"). */
  group?: string
  /** Runs the entry. A returned step keeps the palette open on it. */
  run: () => unknown | Promise<unknown>
}

/**
 * Display text of the secondary line: the explicit secondary, the marker and the
 * shortcut; without the shortcut where the palette shows it as keycaps (palette-quick-add D5).
 */
export function secondaryOf(e: Entry, withShortcut = true): string | undefined {
  const parts = [e.marker, e.secondary, withShortcut ? e.shortcut : undefined].filter(Boolean)
  return parts.length ? parts.join(' · ') : undefined
}

/** Section headings of the palette (keyboard-shortcuts / search-and-command-palette: Recent, Tasks, Projects, Labels, Filters, Commands, Settings). */
export const KIND_GROUP = translatedMap<EntryKind>({
  command: msg('Commands'), task: msg('Tasks'), project: msg('Projects'), label: msg('Labels'), view: msg('Filters'), settings: msg('Settings'), filter: msg('Filters'),
})

export function groupOf(e: Entry): string {
  return e.group ?? KIND_GROUP[e.kind]
}

export const KIND_ICON: Record<EntryKind, IconName> = {
  command: 'chevron-right', task: 'circle', project: 'hash', label: 'tag', view: 'filter', settings: 'settings', filter: 'filter',
}

export function isStep(v: unknown): v is Step {
  return !!v && typeof v === 'object' && 'kind' in v && ['picker', 'confirm', 'prompt'].includes((v as Step).kind)
}
