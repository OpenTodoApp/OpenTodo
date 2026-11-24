// An invite link whose visitor went to sign in (project-invite-links, workspace invites): App returns to it.
import { readString, removeItem, writeString } from '../lib/deviceStorage'

/** sessionStorage key holding a link whose visitor went to sign in (the provider round trip leaves the page). */
export const PENDING_PROJECT_INVITE = 'opentodo.pendingProjectInvite'

export function rememberPendingInvite(token: string) {
  writeString(PENDING_PROJECT_INVITE, token, 'session') // storage blocked: sign-in still works, the link must be opened again
}

/** Reads and clears a remembered link. */
export function takePendingInvite(): string | null {
  const item = readString(PENDING_PROJECT_INVITE, 'session')
  if (item) removeItem(PENDING_PROJECT_INVITE, 'session')
  return item
}
