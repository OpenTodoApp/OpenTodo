// Which contextual help is open (OpenSpec change `user-documentation`, design D5).
// A tiny store so any screen, including a dialog, can open the help panel that the
// Shell renders on top, without unmounting what is underneath.
import { createStore } from './store'

export interface HelpRequest { screen: string; trigger: HTMLElement | null }

const store = createStore<HelpRequest | null>('helpRequest', null)

export function openHelp(screen: string, trigger: HTMLElement | null = null): void {
  store.set({ screen, trigger })
}

export function closeHelp(): void {
  store.set(null)
}

export const useHelpRequest = store.use
