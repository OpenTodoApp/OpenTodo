// The inviter as people read them (#2178). An invitation's preview and invite lists
// carry the inviter's name and never their email; for an inviter with no name the
// server sends this fixed English label instead (displayName in
// internal/auth/invitations.go), which the app shows in the interface language.
import { t } from './i18n'

/** The label the server sends for an inviter with no name. */
export const UNNAMED_INVITER = 'The owner of this server'

/** The inviter's name, or the translated label when they have none. */
export function inviterName(name: string | null | undefined): string {
  const n = name?.trim()
  return !n || n === UNNAMED_INVITER ? t('The owner of this server') : n
}
