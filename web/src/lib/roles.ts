// Client mirror of the server's account role matrix (OpenSpec `user-management`,
// design D1; internal/auth/users.go Authorize). It only decides which controls
// to show: the server stays authoritative and a refused request shows its error.
import type { AccountRole, AdminUser, User } from './types'

export type AdminAction =
  | 'invite'
  | 'list_users'
  | 'deactivate'
  | 'reactivate'
  | 'reset_password'
  | 'delete'
  | 'change_role'
  | 'transfer_ownership'
  | 'change_own_password'

export const ADMIN_ACTIONS: AdminAction[] = [
  'invite', 'list_users', 'deactivate', 'reactivate', 'reset_password', 'delete', 'change_role', 'transfer_ownership', 'change_own_password',
]

/** Why an action is refused, in the server's order of checks. */
export type Refusal = 'self_action' | 'forbidden'

type Actor = { id: string; role: AccountRole }

/** null when allowed, otherwise the error code the server would answer. */
export function authorize(actor: Actor | null, action: AdminAction, target?: Actor | null): Refusal | null {
  if (!actor) return 'forbidden'
  if (action === 'change_own_password') return null
  if (action === 'invite' || action === 'list_users') return actor.role === 'owner' || actor.role === 'admin' ? null : 'forbidden'
  if (!target) return 'forbidden'
  if (target.id === actor.id) return 'self_action'
  if (target.role === 'owner') return 'forbidden'
  switch (action) {
    case 'deactivate':
    case 'reactivate':
    case 'reset_password':
    case 'delete':
      if (actor.role === 'owner') return null
      if (actor.role === 'admin' && target.role === 'member') return null
      return 'forbidden'
    case 'change_role':
    case 'transfer_ownership':
      return actor.role === 'owner' ? null : 'forbidden'
  }
  return 'forbidden'
}

export const can = (actor: Actor | null, action: AdminAction, target?: Actor | null) => authorize(actor, action, target) === null

/** Whether the Users and Members sections are shown in Settings. */
export const isAdministrator = (u: User | null) => can(u, 'list_users')

/** The controls a viewer gets on one row of the Users panel, combining the matrix with the target's state. */
export interface RowActions {
  deactivate: boolean
  reactivate: boolean
  reset: boolean
  remove: boolean
  /** Owner only: promote a member or demote an admin. */
  role: 'admin' | 'member' | null
  transfer: boolean
  /** Owner only: reset the member's second factor (OpenSpec `mfa-totp`). */
  mfaReset: boolean
}

export function rowActions(viewer: User, target: AdminUser): RowActions {
  const active = target.status === 'active'
  const roleOK = can(viewer, 'change_role', target)
  return {
    deactivate: active && can(viewer, 'deactivate', target),
    reactivate: !active && can(viewer, 'reactivate', target),
    reset: active && can(viewer, 'reset_password', target),
    remove: can(viewer, 'delete', target),
    role: roleOK && active ? (target.role === 'admin' ? 'member' : 'admin') : null,
    transfer: active && can(viewer, 'transfer_ownership', target),
    mfaReset: viewer.role === 'owner' && target.id !== viewer.id,
  }
}

export function hasAnyAction(a: RowActions): boolean {
  return a.deactivate || a.reactivate || a.reset || a.remove || a.role !== null || a.transfer || a.mfaReset
}
