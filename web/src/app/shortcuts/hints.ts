// "Show shortcut hints" (OpenSpec change ux-overhaul, keyboard-shortcuts "Shortcut
// hints live in tooltips and menus"): a device-local switch in Settings → General →
// Keyboard. Off, no key badge is printed in the chrome (quick add, section headers,
// prompts); tooltips, menus, the palette and the cheat sheet show shortcuts always.
import { createStoredValue } from '../../lib/deviceStorage'

export const HINTS_KEY = 'opentodo.shortcutHints'

// Another tab's choice applies here too (the storage event). Storage refused:
// the preference just does not stick.
const hints = createStoredValue<boolean>(HINTS_KEY, {
  parse: (raw) => raw === '1',
  serialize: (on) => (on ? '1' : null),
}, { crossTab: true, server: false })

export const shortcutHintsOn = hints.get
export const setShortcutHints = hints.set
export const useShortcutHints = hints.use
