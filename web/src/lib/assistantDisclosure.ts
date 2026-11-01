import { msg, t } from './i18n'

/**
 * The entries of the assistant's "What may be sent" list, as the server sends
 * them in `GET /api/v1/me/assistant` `fields` (`consentFields` and
 * `deviceConsentFields` in internal/httpapi/assistant.go, which a Go test keeps
 * in step with this list). They are listed here so the catalogues translate
 * them; the disclosure shows each one translated.
 */
export const DISCLOSURE_FIELDS = [
  msg('task titles and descriptions'),
  msg('due dates, repeats, priorities, estimates and completion'),
  msg('custom fields, task locations and the links tasks came from'),
  msg('comments'),
  msg('the names, types and links of attachments (never the files)'),
  msg('notes'),
  msg('workspace, project, section and label names, and project descriptions'),
  msg('project, section and label names, and project descriptions'),
  msg('saved view names and the hosts of your webhooks, when you describe a routine'),
  msg('your routines and calendar frames'),
  msg('tracked time and its notes'),
  msg('names of members and groups of shared projects and workspaces'),
  msg("your display name, today's date and your time zone"),
  msg('the messages you type'),
  msg('photos you add'),
] as const

const known = new Set<string>(DISCLOSURE_FIELDS)

/** One entry of the list in the reader's language (an unknown one as sent). */
export function disclosureField(field: string): string {
  return known.has(field) ? t(field) : field
}
