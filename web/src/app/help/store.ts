// Which contextual help is open (OpenSpec change `user-documentation`, design D5).
// A tiny store so any screen, including a dialog, can open the help panel that the
// Shell renders on top, without unmounting what is underneath.
import { useSyncExternalStore } from 'react'

export interface HelpRequest { screen: string; trigger: HTMLElement | null }

let current: HelpRequest | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export function openHelp(screen: string, trigger: HTMLElement | null = null): void {
  current = { screen, trigger }
  emit()
}

export function closeHelp(): void {
  if (!current) return
  current = null
  emit()
}

export function useHelpRequest(): HelpRequest | null {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }, () => current, () => null)
}

/**
 * Screen ids of the earlier per-panel Help links, kept so old links and `:help`
 * topics still open the right place (settings-navigation "Help links name the
 * same screens"): each resolves through the guide's `screens` to an anchor in
 * the section's page. The value is the page's own screen id.
 */
export const LEGACY_HELP_SCREENS: Readonly<Record<string, string>> = {
  'settings/session': 'settings/account', 'settings/sessions': 'settings/account', 'settings/password': 'settings/account',
  'settings/two-factor': 'settings/account', 'settings/security': 'settings/account', 'settings/linked-accounts': 'settings/account',
  'settings/encryption': 'settings/account', 'settings/activity': 'settings/account',
  'settings/appearance': 'settings/appearance',
  'settings/preferences': 'settings/general', 'settings/start-view': 'settings/general', 'settings/date-time': 'settings/general',
  'settings/calendar': 'settings/general', 'settings/keyboard': 'settings/general',
  'settings/quick-add': 'settings/capture', 'settings/voice': 'settings/capture', 'settings/email': 'settings/capture',
  'settings/caldav': 'settings/integrations', 'settings/calendar-feeds': 'settings/integrations', 'settings/webhooks': 'settings/integrations', 'settings/tokens': 'settings/integrations',
  'settings/ai': 'settings/integrations', 'settings/assistants': 'settings/integrations', 'settings/assistant': 'settings/integrations',
  'settings/projects': 'settings/data',
  'settings/admin': 'settings/people', 'settings/users': 'settings/people', 'settings/members': 'settings/people',
  'settings/access': 'settings/people', 'settings/sso': 'settings/people', 'settings/project-invites': 'settings/people',
  'settings/backups': 'settings/server', 'settings/attachments': 'settings/server',
}
