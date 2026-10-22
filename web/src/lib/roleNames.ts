// Role names as people read them, in the interface language (OpenSpec change
// app-localization). The stored values stay the English codes.
import { msg, translatedMap } from './i18n/catalog'
import type { AccountRole, ProjectRole, WorkspaceRole } from './types'

/** A project role inside a sentence ("as editor"). */
export const PROJECT_ROLE_NAME = translatedMap<ProjectRole>({ owner: msg('owner'), admin: msg('admin'), editor: msg('editor'), viewer: msg('viewer') })

/** A workspace role inside a sentence (OpenSpec change `workspaces`). */
export const WORKSPACE_ROLE_NAME = translatedMap<WorkspaceRole>({ owner: msg('owner'), admin: msg('admin'), member: msg('member') })

/** A project or workspace role in a sentence; an unknown code (newer server) is shown as it is. */
export function roleName(role: string): string {
  return (PROJECT_ROLE_NAME as Record<string, string>)[role] ?? (WORKSPACE_ROLE_NAME as Record<string, string>)[role] ?? role
}

/** An account role as a label ("Admin"). */
export const ACCOUNT_ROLE_LABEL = translatedMap<AccountRole>({ owner: msg('Owner'), admin: msg('Admin'), member: msg('Member') })
