// The browser's install prompt (OpenSpec change ux-overhaul, first-run "Install
// the app or skip"): Chromium-based browsers fire `beforeinstallprompt` once the
// app is installable; the event is kept so the first-run card can show it on a
// tap. Where the event never comes (Safari, Firefox), the card links to the guide.
import { createStore } from '../lib/store'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const deferred = createStore<BeforeInstallPromptEvent | null>('installPrompt', null)

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred.set(e as BeforeInstallPromptEvent)
  })
  window.addEventListener('appinstalled', () => deferred.set(null))
}

/** Whether the browser offered an install prompt this session. */
export function canInstall(): boolean {
  return deferred.get() !== null
}

/** Shows the browser's install prompt, once; resolves when the person answered it. */
export async function installPrompt(): Promise<void> {
  const e = deferred.get()
  if (!e) return
  deferred.set(null)
  await e.prompt()
  await e.userChoice.catch(() => undefined)
}

export function useInstallPrompt(): boolean {
  return deferred.use() !== null
}

/** Tests: pretend the browser offered a prompt. */
export function setInstallPromptForTests(e: { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> } | null): void {
  deferred.set(e as BeforeInstallPromptEvent | null)
}
