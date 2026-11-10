// The names of the four priority levels (OpenSpec change priority-names, design
// D2, D3): `user_prefs.priority_name_1` … `_4`, each the person's own word for
// the level or "" for the default ("Priority 1" in the interface language). The
// stored priority of a task stays the number; only the label changes. Like the
// date format, DateTimePrefsProvider publishes the names as a module snapshot
// during render (setPriorityNames) and bumps the resolved date-time version, so
// every list, row and menu that follows the date format follows the names too.
// Every place that shows a level to a person reads it here (ui-lint keeps the raw
// "Priority {n}" message in this file).
import { t } from './i18n'
import { resettable } from './moduleState'
import type { UserPrefs } from './types'

/** The longest name, in characters: it has to fit a chip and a menu row at 360 px. */
export const PRIORITY_NAME_MAX = 24

type Names = readonly [string, string, string, string]
const NONE: Names = ['', '', '', '']
let names: Names = NONE
resettable('priorityNames', () => { names = NONE })

type Row = Partial<UserPrefs> & { _e2ee?: { raw?: Record<string, unknown> } }

/**
 * The four names as shown: one line, trimmed, a longer stored value cut to 24
 * characters with an ellipsis (the row keeps it). A value this device cannot
 * decrypt, or any value while `locked`, reads as the default.
 */
export function readPriorityNames(row: Row | null | undefined, locked = false): Names {
  const one = (n: 1 | 2 | 3 | 4): string => {
    const f = `priority_name_${n}` as const
    const v = row?.[f]
    if (locked || typeof v !== 'string' || row?._e2ee?.raw?.[f]) return ''
    const chars = [...v.replace(/\s+/g, ' ').trim()]
    return chars.length > PRIORITY_NAME_MAX ? `${chars.slice(0, PRIORITY_NAME_MAX).join('')}…` : chars.join('')
  }
  return [one(1), one(2), one(3), one(4)]
}

/** Replaces the snapshot (DateTimePrefsProvider; tests). */
export function setPriorityNames(next: Names): void {
  names = next
}

/** The person's own name for a level, or '' when it has none. */
export function customPriorityName(n: number): string {
  return names[n - 1] ?? ''
}

/** A level's default name, "Priority 1" in the interface language. */
export function defaultPriorityName(n: number): string {
  return t('Priority {n}', { n })
}

/** A level as a word: the person's name, else "Priority 1". */
export function priorityName(n: number): string {
  return customPriorityName(n) || defaultPriorityName(n)
}

/** A level where today's text is the short "P1" (row facts, chips, menus): the person's name, else "P1". */
export function priorityShort(n: number): string {
  return customPriorityName(n) || `P${n}`
}

/**
 * What the shortcut sheet adds after the description of the shortcut `id`: for the
 * keys that set a priority (list.priority, panel.priority, vim.priority) once any
 * level has a name, " — 1 Must, 2 Should, 3 Priority 3, 4 Priority 4"; else ''.
 */
export function priorityKeysText(id: string): string {
  return id.endsWith('.priority') && names.some(Boolean) ? ` — ${[1, 2, 3, 4].map((n) => `${n} ${priorityName(n)}`).join(', ')}` : ''
}

/** What a screen reader hears: "Must, priority 1" for a named level, so the number is never lost; else "Priority 1". */
export function priorityAccessibleName(n: number): string {
  const name = customPriorityName(n)
  return name ? t('{name}, priority {n}', { name, n }) : defaultPriorityName(n)
}
