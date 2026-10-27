// Vim keybindings preference (OpenSpec `vim-keybindings`, design D1): one
// device-local flag in localStorage, never synced and never sent to the server.
// This module is in the main bundle (Shell and Settings read it); the Vim layer
// itself is loaded lazily only while the flag is on.
import { createStoredValue } from '../../lib/deviceStorage'

export const VIM_KEY = 'opentodo.vim'

// Another tab of the app toggling it applies here too (the storage event).
const vim = createStoredValue<boolean>(VIM_KEY, {
  parse: (raw) => raw === '1',
  serialize: (on) => (on ? '1' : null),
}, { crossTab: true, server: false })

/** Whether Vim keybindings are on for this device (off by default). */
export const isVimEnabled = vim.get

/** Turn the layer on or off; takes effect at once, without a reload. Storage refused: it does not stick. */
export const setVimEnabled = vim.set

/** Sign-out wipes local data; the preference goes with it (App's logout calls this). */
export function clearVimPref(): void {
  setVimEnabled(false)
}

export const subscribeVim = vim.subscribe
export const useVimEnabled = vim.use
