// iPad key commands (OpenSpec change tablet-shells, design D1). The shell lists the
// app's main shortcuts in the system's shortcut overlay, under the system's own
// Cmd chords, and sends the page the shortcut id as `opentodo:shortcut`. The page
// presses that shortcut's own keys through the one dispatcher, so the screen's
// overrides apply (the calendar's `q` adds on the focused day) and the registry
// stays the one source. Loaded only in a shell that lists `key-commands`.
import { dispatch } from '../app/shortcuts/dispatch'
import { chordsOf, SHORTCUTS, type Chord } from './shortcuts'

export const SHORTCUT_EVENT = 'opentodo:shortcut'
/**
 * The overlay's commands: the shortcut id, the Cmd chord the shell registers and its
 * title (translated by the shell). Cmd+K is the page's own chord for search; the
 * others are the system's habits. Pinned for the shells by the bridge fixture key-commands.json.
 */
export const KEY_COMMANDS = [
  { id: 'list.quick-add', input: 'n', title: 'Add task' },
  { id: 'global.palette', input: 'k', title: 'Search' },
  { id: 'go.inbox', input: '1', title: 'Inbox' },
  { id: 'go.today', input: '2', title: 'Today' },
  { id: 'go.upcoming', input: '3', title: 'Upcoming' },
] as const
/** The shortcuts the shell may press. */
export const SHELL_SHORTCUTS: readonly string[] = KEY_COMMANDS.map((c) => c.id)
/** The script the shell runs for one command. */
export const shortcutScript = (id: string): string => `window.dispatchEvent(new CustomEvent('${SHORTCUT_EVENT}', { detail: { id: '${id}' } }))`

function keyEvent(c: Chord): KeyboardEvent {
  const key = c.key.length === 1 && c.shift ? c.key.toUpperCase() : c.key
  return new KeyboardEvent('keydown', {
    key, bubbles: true, cancelable: true,
    ctrlKey: c.ctrl === 'ctrl', metaKey: c.ctrl === 'meta' || c.ctrl === 'either', altKey: c.alt, shiftKey: c.shift,
  })
}

/**
 * Presses the shortcut's first chord sequence, as if typed outside a text field:
 * the overlay's command works wherever focus is. Returns whether its last key ran something.
 */
export function pressShortcut(id: string, run: (e: KeyboardEvent) => boolean = dispatch): boolean {
  if (!SHELL_SHORTCUTS.includes(id)) return false
  const entry = SHORTCUTS.find((s) => s.id === id)
  const seq = entry ? chordsOf(entry)[0] : undefined
  if (!seq) return false
  let ran = false
  for (const chord of seq) {
    const e = keyEvent(chord)
    Object.defineProperty(e, 'target', { value: document.body })
    ran = run(e)
  }
  return ran
}

/** Answers the shell's event from now on; returns the stop. */
export function listenForShellShortcuts(win: Window = window): () => void {
  const on = (e: Event) => { const id = (e as CustomEvent<{ id?: unknown }>).detail?.id; if (typeof id === 'string') pressShortcut(id) }
  win.addEventListener(SHORTCUT_EVENT, on)
  return () => win.removeEventListener(SHORTCUT_EVENT, on)
}
