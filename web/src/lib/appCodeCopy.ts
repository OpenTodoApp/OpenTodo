// The words for a failed check of the app's code (OpenSpec change
// signed-web-app, design D18): one sentence that names the likely cause, shared
// by the refusal banner and Settings → About, and the help page they link to.
import { msg } from './i18n/catalog'
import type { CheckCause } from './appTrust'

/** The in-app Help page every failed check links to (docs/signed-updates.md). */
export const SIGNED_UPDATES_PAGE = 'signed-updates'

const CAUSES: Record<CheckCause, string> = {
  'changed-file': msg("A proxy or the server changed the app's files."),
  'missing-file': msg("A proxy or the server changed the app's files."),
  unsigned: msg("It isn't signed by OpenTodo."),
  'unknown-key': msg("It isn't signed by OpenTodo."),
  'bad-signature': msg("It isn't signed by OpenTodo."),
  older: msg('The server went back to an older version.'),
  'no-list': msg("The server's list of files couldn't be read."),
}

const OWN_KEY = msg("It isn't signed with this app's key.")

/** The cause sentence; a device that trusts an own-key build's key names that key instead of OpenTodo. */
export function causeMessage(cause: CheckCause | undefined, ownKey: boolean): string {
  const c = cause ?? 'changed-file'
  if (ownKey && (c === 'unsigned' || c === 'unknown-key' || c === 'bad-signature')) return OWN_KEY
  return CAUSES[c] ?? CAUSES['changed-file']
}

export const REFUSED = msg("This update wasn't installed.")
export const REPORTED = msg("The last update didn't pass the check. It was installed: checks only report for now.")
export const WHAT_TO_DO = msg('What to do')
