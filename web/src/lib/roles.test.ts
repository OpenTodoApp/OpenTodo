// Same cases as TestAuthorizeMatrix in internal/auth/users_test.go.
import { describe, expect, it } from 'vitest'
import { ADMIN_ACTIONS, type AdminAction, authorize, hasAnyAction, isAdministrator, type Refusal, rowActions } from './roles'
import type { AccountRole, AdminUser, User } from './types'

const u = (id: string, role: AccountRole): User => ({ id, role, email: `${id}@example.com`, name: id, createdAt: 0 })
const owner = u('o', 'owner')
const admin = u('a', 'admin')
const admin2 = u('a2', 'admin')
const member = u('m', 'member')
const member2 = u('m2', 'member')
const memberActions = new Set<AdminAction>(['deactivate', 'reactivate', 'reset_password', 'delete'])

function expected(actor: User, action: AdminAction, target: User): Refusal | null {
  if (action === 'change_own_password') return null
  if (action === 'invite' || action === 'list_users') return actor.role === 'member' ? 'forbidden' : null
  if (target.id === actor.id) return 'self_action'
  if (target.role === 'owner') return 'forbidden'
  if (actor.role === 'owner') return null
  if (actor.role === 'admin' && memberActions.has(action) && target.role === 'member') return null
  return 'forbidden'
}

describe('authorize (role matrix)', () => {
  it('matches the server matrix for every role, action and target', () => {
    for (const actor of [owner, admin, member]) {
      for (const action of ADMIN_ACTIONS) {
        for (const target of [owner, admin, admin2, member, member2]) {
          expect(authorize(actor, action, target), `${actor.role} ${action} ${target.id}`).toBe(expected(actor, action, target))
        }
      }
    }
  })

  it('spells out the design cases', () => {
    expect(authorize(owner, 'deactivate', owner)).toBe('self_action')
    expect(authorize(owner, 'change_role', admin)).toBeNull()
    expect(authorize(admin, 'deactivate', member)).toBeNull()
    expect(authorize(admin, 'delete', admin2)).toBe('forbidden')
    expect(authorize(admin, 'reset_password', owner)).toBe('forbidden')
    expect(authorize(admin, 'change_role', member)).toBe('forbidden')
    expect(authorize(admin, 'transfer_ownership', member)).toBe('forbidden')
    expect(authorize(admin, 'invite')).toBeNull()
    expect(authorize(member, 'list_users')).toBe('forbidden')
    expect(authorize(member, 'change_own_password')).toBeNull()
    expect(authorize(null, 'change_own_password')).toBe('forbidden')
  })

  it('shows the administration sections to owner and admins only', () => {
    expect(isAdministrator(owner)).toBe(true)
    expect(isAdministrator(admin)).toBe(true)
    expect(isAdministrator(member)).toBe(false)
    expect(isAdministrator(null)).toBe(false)
  })
})

describe('rowActions', () => {
  const row = (x: User, status: AdminUser['status'] = 'active'): AdminUser => ({ ...x, lastLoginAt: null, status })

  it('gives an admin member actions only, and no role or transfer controls', () => {
    const m = rowActions(admin, row(member))
    expect(m).toMatchObject({ deactivate: true, reset: true, remove: true, role: null, transfer: false, mfaReset: false })
    expect(hasAnyAction(rowActions(admin, row(admin2)))).toBe(false)
    expect(hasAnyAction(rowActions(admin, row(owner)))).toBe(false)
  })

  it('gives the owner role toggle and transfer, and none on themselves', () => {
    expect(rowActions(owner, row(member)).role).toBe('admin')
    expect(rowActions(owner, row(admin)).role).toBe('member')
    expect(rowActions(owner, row(admin)).transfer).toBe(true)
    expect(hasAnyAction(rowActions(owner, row(owner)))).toBe(false)
  })

  it('offers reactivate instead of deactivate, reset, role and transfer on a deactivated account', () => {
    const a = rowActions(owner, row(member, 'deactivated'))
    expect(a).toMatchObject({ deactivate: false, reactivate: true, reset: false, remove: true, role: null, transfer: false })
  })
})
