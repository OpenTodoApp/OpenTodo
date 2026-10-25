// The state of each sub-page in a word, shown on its overview row (OpenSpec change
// settings-subpages, design D2): "Webhooks · 2", "Calendar feeds · Off". Each loader
// asks the server once when the overview opens; offline, refused (403, a demo) or
// failing loaders show nothing, never a stale or made-up value.
import { api } from '../lib/api'
import { encryptionSnapshot } from '../lib/e2ee'
import { currentLanguage, t } from '../lib/i18n'
import { nativeName } from '../locales'
import type { User } from '../lib/types'

type Loader = (user: User) => Promise<string | null>

const onOff = (on: boolean) => (on ? t('On') : t('Off'))
const count = (n: number) => (n === 0 ? t('None') : String(n))

/** Loaders by `<section>/<page>`; a page without one shows no state. */
export const PAGE_STATUS: Readonly<Record<string, Loader>> = {
  'language/language': async () => nativeName(currentLanguage()),
  'account/profile': async (u) => u.name || null,
  'account/security': async () => ((await api.mfaStatus()).mfa.enrolled ? t('Two-factor on') : t('Two-factor off')),
  'account/encryption': async () => onOff(encryptionSnapshot().enabled),
  'notifications/digest': async () => { const d = await api.emailDigest(); return d.available ? onOff(d.enabled) : null },
  'integrations/caldav': async () => onOff((await api.caldavSetting()).enabled),
  'integrations/calendar-feeds': async () => onOff((await api.calendarFeedsSetting()).enabled),
  'integrations/issues': async () => ((await api.getIssuesSetting()).enabled ? count((await api.listIssueConnections()).connections.length) : t('Off')),
  'integrations/webhooks': async () => count((await api.listWebhooks()).webhooks.length),
  'integrations/tokens': async () => count((await api.listTokens()).tokens.length),
  'integrations/assistant': async () => onOff((await api.getMyAssistant()).enabled),
  'integrations/mcp': async () => onOff((await api.getMcpSettings()).enabled),
  'people/users': async () => String((await api.listUsers()).users.length),
  'people/sso': async () => onOff((await api.getOidcSettings()).enabled),
  'server/backups': async () => onOff((await api.backupStatus()).enabled),
  'server/attachments': async () => onOff((await api.attachmentSettings()).enabled),
  'server/outgoing-email': async () => onOff((await api.smtpSettings()).configured),
  'server/maps': async () => onOff((await api.getMapsSetting()).enabled),
  'server/automations': async () => onOff((await api.getAutomationsSetting()).enabled),
  'server/speech': async () => onOff((await api.speechSettings()).url !== ''),
}

/** The word for one page, or null when it has none or it cannot be read now. */
export async function pageStatus(user: User, section: string, page: string): Promise<string | null> {
  const load = PAGE_STATUS[`${section}/${page}`]
  if (!load) return null
  try {
    return await load(user)
  } catch {
    return null
  }
}
