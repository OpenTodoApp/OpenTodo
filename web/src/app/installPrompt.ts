// The browser's install prompt (OpenSpec change ux-overhaul, first-run "Install
// the app or skip"): Chromium-based browsers fire `beforeinstallprompt` once the
// app is installable; the event is kept so the first-run card can show it on a
// tap. Where the event never comes (Safari, Firefox), the card links to the guide.
import { useSyncExternalStore } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((fn) => fn())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => { deferred = null; notify() })
}

/** Whether the browser offered an install prompt this session. */
export function canInstall(): boolean {
  return deferred !== null
}

/** Shows the browser's install prompt, once; resolves when the person answered it. */
export async function installPrompt(): Promise<void> {
  const e = deferred
  if (!e) return
  deferred = null
  notify()
  await e.prompt()
  await e.userChoice.catch(() => undefined)
}

export function useInstallPrompt(): boolean {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }, canInstall, () => false)
}

/** Tests: pretend the browser offered a prompt. */
export function setInstallPromptForTests(e: { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> } | null): void {
  deferred = e as BeforeInstallPromptEvent | null
  notify()
}
