// "Single-key shortcuts" (OpenSpec change accessibility-aa, WCAG 2.2 2.1.4 Character key
// shortcuts): a device-local switch in Settings → General → Keyboard, on by default. Off,
// a shortcut that starts with one letter, number, punctuation or symbol key (q, j, 1, ?, g
// then t) does nothing, so speech input or a stray press cannot run a command; shortcuts
// with Ctrl, Alt or ⌘ and the named keys (arrows, Enter, Escape, Delete) keep working.
import { createStoredValue } from '../../lib/deviceStorage'
import type { Chord } from '../../lib/shortcuts'

export const SINGLE_KEYS_KEY = 'opentodo.singleKeys'

// Another tab's choice applies here too (the storage event); storage refused: they stay on.
const singleKeys = createStoredValue<boolean>(SINGLE_KEYS_KEY, {
  parse: (raw) => raw !== '0',
  serialize: (on) => (on ? null : '0'),
}, { crossTab: true, server: true })

export const singleKeysOn = singleKeys.get
export const setSingleKeys = singleKeys.set
export const useSingleKeys = singleKeys.use

/** A key a speech command or a stray press can type: one character, without Ctrl, Alt or ⌘. */
export function isCharacterKey(c: Chord): boolean {
  return !c.ctrl && !c.alt && c.key.length === 1 && c.key !== ' '
}
