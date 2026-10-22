// @vitest-environment happy-dom
// web-app "Settings": sign out from the Account section confirms first; the
// Profile card (settings-refresh, account-profile "Profile in Settings").
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { click, flush, key, render, type } from '../ui/test-utils'
import { SessionPanel } from './AccountSettings'
import type { Profile, User } from '../lib/types'

const net = vi.hoisted(() => ({ online: true }))
vi.mock('../lib/online', () => ({ useOnline: () => net.online }))
const calls = vi.hoisted(() => ({ profile: vi.fn(), renameProfile: vi.fn(), changeEmail: vi.fn(), cancelEmailChange: vi.fn(), putAvatar: vi.fn(), deleteAvatar: vi.fn() }))
vi.mock('../lib/api', async (orig) => {
  const real = await orig<typeof import('../lib/api')>()
  return { ...real, api: { ...real.api, ...calls } }
})
import { ProfileSection } from './profile/ProfileSection'
import { ApiError } from '../lib/api'

const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!

describe('SessionPanel', () => {
  it('signs out only after confirming', async () => {
    const onLogout = vi.fn()
    const { unmount } = await render(<SessionPanel onLogout={onLogout} />)
    await click(button('Sign out'))
    await flush(20)
    expect(onLogout).not.toHaveBeenCalled()
    expect(document.querySelector('[data-testid="confirm-dialog"]')?.textContent).toContain('local copy of your tasks is cleared')
    const confirm = [...document.querySelectorAll('[data-testid="confirm-dialog"] button')].find((b) => b.textContent === 'Sign out')!
    await click(confirm)
    await flush(20)
    expect(onLogout).toHaveBeenCalledTimes(1)
    await unmount()
  })

  it('signs out everywhere only after confirming, then signs this device out (route-authorization-policy)', async () => {
    const onLogout = vi.fn()
    const everywhere = vi.fn(async () => {})
    const { unmount } = await render(<SessionPanel onLogout={onLogout} onSignOutEverywhere={everywhere} />)
    await click(button('Sign out everywhere'))
    await flush(20)
    expect(everywhere).not.toHaveBeenCalled()
    expect(document.querySelector('[data-testid="confirm-dialog"]')?.textContent).toContain('API tokens and app passwords stop working')
    const confirm = [...document.querySelectorAll('[data-testid="confirm-dialog"] button')].find((b) => b.textContent === 'Sign out everywhere')!
    await click(confirm)
    await flush(20)
    expect(everywhere).toHaveBeenCalledTimes(1)
    expect(onLogout).toHaveBeenCalledTimes(1)
    await unmount()
  })

  it('keeps this device signed in when signing out everywhere fails', async () => {
    const onLogout = vi.fn()
    const everywhere = vi.fn(async () => { throw new Error('You are offline.') })
    const { unmount } = await render(<SessionPanel onLogout={onLogout} onSignOutEverywhere={everywhere} />)
    await click(button('Sign out everywhere'))
    await flush(20)
    const confirm = [...document.querySelectorAll('[data-testid="confirm-dialog"] button')].find((b) => b.textContent === 'Sign out everywhere')!
    await click(confirm)
    await flush(20)
    expect(onLogout).not.toHaveBeenCalled()
    expect(document.querySelector('[data-testid="confirm-dialog"]')?.textContent).toContain('You are offline.')
    await unmount()
  })

  it('Cancel clears nothing and returns focus to the Sign out button', async () => {
    const onLogout = vi.fn()
    const { unmount } = await render(<SessionPanel onLogout={onLogout} />)
    const signOut = button('Sign out')
    signOut.focus()
    await click(signOut)
    await flush(20)
    expect(document.activeElement?.textContent).toBe('Cancel')
    await key(document.activeElement!, 'Escape')
    await flush(20)
    expect(onLogout).not.toHaveBeenCalled()
    expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeNull()
    expect(document.activeElement).toBe(signOut)
    await unmount()
  })
})

const me: User = { id: 'u1', email: 'raffa@example.com', name: 'Raffa', role: 'member', createdAt: 1 }
const prof = (over: Partial<Profile> = {}, user: Partial<User> = {}): Profile => ({ user: { ...me, ...user }, avatarVersion: 0, emailByLink: true, ...over })
const value = (k: string) => document.querySelector(`[data-profile-value="${k}"]`)?.textContent
const edit = (k: string) => document.querySelector<HTMLButtonElement>(`[data-profile-edit="${k}"]`)

describe('ProfileSection', () => {
  beforeEach(() => {
    net.online = true
    localStorage.clear()
    Object.values(calls).forEach((f) => f.mockReset())
  })
  afterEach(() => { document.body.innerHTML = '' })

  it('Rename: the new name shows at once and the app is told', async () => {
    calls.profile.mockResolvedValue(prof())
    calls.renameProfile.mockResolvedValue(prof({}, { name: 'Raffaele' }))
    const changed = vi.fn()
    window.addEventListener('opentodo:account-changed', changed)
    const r = await render(<ProfileSection user={me} />)
    await flush(20)
    expect(value('name')).toBe('Raffa')
    await click(edit('name')!)
    const input = document.querySelector<HTMLInputElement>('[data-testid="profile-field-dialog"] input')!
    input.select()
    await type(input, 'Raffaele')
    await click(document.querySelector('[data-profile-save]')!)
    await flush(20)
    expect(calls.renameProfile).toHaveBeenCalledWith('Raffaele')
    expect(value('name')).toBe('Raffaele')
    expect(changed).toHaveBeenCalled()
    window.removeEventListener('opentodo:account-changed', changed)
    await r.unmount()
  })

  it('Email: pending shows the address waiting and can be cancelled; a refusal stays in the dialog', async () => {
    calls.profile.mockResolvedValue(prof())
    calls.changeEmail.mockRejectedValueOnce(new ApiError(409, 'email_taken', 'another account uses this email'))
    calls.changeEmail.mockResolvedValueOnce(prof({ pendingEmail: 'new@example.com' }))
    calls.cancelEmailChange.mockResolvedValue(prof())
    const r = await render(<ProfileSection user={me} />)
    await flush(20)
    await click(edit('email')!)
    const input = document.querySelector<HTMLInputElement>('[data-testid="profile-field-dialog"] input')!
    input.select()
    await type(input, 'new@example.com')
    await click(document.querySelector('[data-profile-save]')!)
    await flush(20)
    expect(document.querySelector('[data-testid="profile-field-dialog"]')?.textContent).toContain('another account uses this email')
    await click(document.querySelector('[data-profile-save]')!)
    await flush(20)
    expect(document.querySelector('[data-testid="profile-field-dialog"]')).toBeNull()
    expect(document.querySelector('[data-profile-pending]')?.textContent).toBe('Waiting for confirmation: new@example.com')
    expect(value('email')).toBe('raffa@example.com')
    await click(document.querySelector('[data-profile-cancel-email]')!)
    await flush(20)
    expect(document.querySelector('[data-profile-pending]')).toBeNull()
    await r.unmount()
  })

  it('Email confirmed elsewhere: the card reads the new address on the next load', async () => {
    calls.profile.mockResolvedValue(prof({}, { email: 'new@example.com' }))
    const r = await render(<ProfileSection user={me} />)
    await flush(20)
    expect(value('email')).toBe('new@example.com')
    expect(document.querySelector('[data-profile-pending]')).toBeNull()
    await r.unmount()
  })

  it('Single sign-on only: the email is read-only and names the provider', async () => {
    calls.profile.mockResolvedValue(prof({ emailManagedBy: 'https://id.example.com' }))
    const r = await render(<ProfileSection user={me} />)
    await flush(20)
    expect(edit('email')).toBeNull()
    expect(document.querySelector('[data-setting-row="profile-email"]')?.textContent).toContain('Your sign-in provider manages it: https://id.example.com.')
    await r.unmount()
  })

  it('Offline: the last loaded values, the edit actions disabled and a note', async () => {
    localStorage.setItem('opentodo.profile', JSON.stringify(prof({}, { name: 'Raffaele' })))
    net.online = false
    const r = await render(<ProfileSection user={me} />)
    await flush(20)
    expect(calls.profile).not.toHaveBeenCalled()
    expect(value('name')).toBe('Raffaele')
    expect(['picture', 'name', 'email'].every((k) => edit(k)!.disabled)).toBe(true)
    expect(document.querySelector('[data-testid="profile-card"]')?.textContent).toContain('Changing your profile needs a connection.')
    await r.unmount()
  })
})
