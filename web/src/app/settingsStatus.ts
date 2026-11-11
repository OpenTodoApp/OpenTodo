// The state of each sub-page in a word, shown on its overview row (OpenSpec change
// settings-subpages, design D2): "Webhooks · 2", "Calendar feeds · Off". Each loader
// asks the server once when the overview opens; offline, refused (403, a demo) or
// failing loaders show nothing, never a stale or made-up value. settings-foundation
// D5: a state the sub-page shows in the warning or danger tone carries that tone here
// too; every other state is neutral text, so the overview stays calm.
import { api } from '../lib/api'
import { encryptionSnapshot } from '../lib/e2ee'
import { currentLanguage, t } from '../lib/i18n'
import { nativeName } from '../locales'
import type { User } from '../lib/types'
import type { StatusTone } from '../ui'

/** A sub-page's state: its word and, for a state that blocks or fails, the tone the sub-page shows it in. */
export interface PageState { text: string; tone?: Extract<StatusTone, 'warn' | 'danger'> }

type Loader = (user: User) => Promise<PageState | string | null>

const onOff = (on: boolean) => (on ? t('On') : t('Off'))
const count = (n: number) => (n === 0 ? t('None') : String(n))
const warn = (text: string): PageState => ({ text, tone: 'warn' })

/** Loaders by `<section>/<page>`; a page without one shows no state. */
export const PAGE_STATUS: Readonly<Record<string, Loader>> = {
  'language/language': async () => nativeName(currentLanguage()),
  'account/profile': async (u) => u.name || null,
  'account/security': async () => ((await api.mfaStatus()).mfa.enrolled ? t('Two-factor on') : warn(t('Two-factor off'))),
  'account/encryption': async () => onOff(encryptionSnapshot().enabled),
  'notifications/digest': async () => { const d = await api.emailDigest(); return d.available ? onOff(d.enabled) : null },
  'integrations/caldav': async () => onOff((await api.caldavSwitch.get()).enabled),
  'integrations/calendar-feeds': async () => onOff((await api.calendarFeedsSwitch.get()).enabled),
  'integrations/calendar-sync': async () => ((await api.calendarSyncSwitch.get()).enabled ? count((await api.listCalendarConnections()).connections.length) : t('Off')),
  'integrations/issues': async () => ((await api.issuesSwitch.get()).enabled ? count((await api.listIssueConnections()).connections.length) : t('Off')),
  'integrations/webhooks': async () => {
    const hooks = (await api.listWebhooks()).webhooks
    // A webhook failing now (webhookStatus's danger tone) shows as the danger tone with the count.
    const failing = hooks.some((h) => (h.enabled ? h.consecutiveFailures > 0 : h.disabledReason === 'too_many_failures'))
    return failing ? { text: count(hooks.length), tone: 'danger' } : count(hooks.length)
  },
  'integrations/tokens': async () => count((await api.listTokens()).tokens.length),
  'integrations/assistant': async () => onOff((await api.getMyAssistant()).enabled),
  'integrations/mcp': async () => onOff((await api.getMcpSettings()).enabled),
  'people/users': async () => String((await api.listUsers()).users.length),
  'people/sso': async () => onOff((await api.getOidcSettings()).enabled),
  'server/backups': async () => {
    const s = await api.backupStatus()
    if (!s.lastRun && !s.running) return warn(t('No backup yet'))
    if (s.lastRun?.status === 'failed') return { text: t('Failed'), tone: 'danger' }
    return onOff(s.enabled)
  },
  'server/attachments': async () => onOff((await api.attachmentSettings()).enabled),
  'server/outgoing-email': async () => ((await api.smtpSettings()).configured ? t('On') : warn(t('Not configured'))),
  'server/maps': async () => onOff((await api.getMapsSetting()).enabled),
  'server/automations': async () => onOff((await api.automationsSwitch.get()).enabled),
  'server/speech': async () => onOff((await api.speechSettings()).url !== ''),
}

/** The state of one page, or null when it has none or it cannot be read now. */
export async function pageStatus(user: User, section: string, page: string): Promise<PageState | null> {
  const load = PAGE_STATUS[`${section}/${page}`]
  if (!load) return null
  try {
    const state = await load(user)
    if (state === null) return null
    return typeof state === 'string' ? { text: state } : state
  } catch {
    return null
  }
}
