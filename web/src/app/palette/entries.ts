// Command palette entries (OpenSpec change search-and-command-palette, design D2).
// One shape for everything the box lists: tasks, projects, labels, saved views,
// Settings sections, commands and filter-query results. Built on the device from
// the local tables, never persisted and never sent anywhere.
import type { ConfirmSpec, PickerSpec } from '../menus/ActionMenu'
import type { IconName } from '../../ui'

export type EntryKind = 'command' | 'task' | 'project' | 'label' | 'view' | 'settings' | 'filter'

/** What a command may ask for after it is picked; the palette shows it in place. */
export type Step =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  /** Runs the entry. A returned step keeps the palette open on it. */
  run: () => unknown | Promise<unknown>
}

/** Display text of the secondary line: the explicit secondary, the marker and the shortcut. */
export function secondaryOf(e: Entry): string | undefined {
  const parts = [e.marker, e.secondary, e.shortcut].filter(Boolean)
  return parts.length ? parts.join(' · ') : undefined
}

export const KIND_ICON: Record<EntryKind, IconName> = {
  command: 'chevron-right', task: 'circle', project: 'hash', label: 'tag', view: 'filter', settings: 'settings', filter: 'filter',
}

export function isStep(v: unknown): v is Step {
  return !!v && typeof v === 'object' && 'kind' in v && ['picker', 'confirm', 'prompt'].includes((v as Step).kind)
}
