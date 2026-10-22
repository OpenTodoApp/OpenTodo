// Project invite links (OpenSpec `project-invite-links`): the share-dialog
// section, the acceptance screen and the owner switch, rendered to static
// markup like the other component tests (no DOM library).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthStatus, ProjectInvite, ProjectInvitePreview, User } from '../lib/types'
import { AuthScreen } from './AuthScreen'
import { InviteLinksView, type InviteLinksViewProps } from './InviteLinksSection'
import { PENDING_PROJECT_INVITE, ProjectInviteView, type JoinState, type ProjectInviteState, type VisitorStep, rememberPendingInvite, takePendingInvite } from './ProjectInviteScreen'
import { ProjectInvitePolicyView } from './ProjectInvitePolicyPanel'
import { parseRoute, routePath } from './router'

/** The card's markup without its Learn more link, the one help link a card may carry (settings-copy D3). */
const withoutLearnMore = (html: string) => html.replace(/<button[^>]*data-learn-more[^>]*>Learn more<\/button>/g, '')


const noop = () => {}

// ---- share dialog section ----

const pending: ProjectInvite = {
  id: 'i1', projectId: 'p1', role: 'editor', email: 'dora@example.com', createdBy: 'u1', createdByName: 'Alice',
  createdAt: Date.UTC(2026, 9, 1), expiresAt: Date.UTC(2026, 9, 8),
}

function links(over: Partial<InviteLinksViewProps> = {}): string {
  const props: InviteLinksViewProps = {
    roles: ['viewer', 'editor', 'admin'], open: false, role: 'editor', email: '', hours: 168, invites: [], created: null, copied: false,
    offline: false, busy: false, error: null,
    onToggle: noop, onRole: noop, onEmail: noop, onHours: noop, onCreate: noop, onCopy: noop, onRevoke: noop, ...over,
  }
  return renderToStaticMarkup(createElement(InviteLinksView, props))
}

describe('InviteLinksView', () => {
  it('starts collapsed with a keyboard-reachable disclosure button', () => {
    const html = links()
    expect(html).toContain('Invite with a link')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('<form')
  })

  it('offers role, email and expiry when open, with seven days preselected', () => {
    const html = links({ open: true, roles: ['viewer', 'editor'] })
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('<form')
    expect(html).toContain('>viewer</option>')
    expect(html).not.toContain('>admin</option>')
    expect(html).toMatch(/<option value="168" selected="">7 days<\/option>/)
    expect(html).toContain('30 days')
    expect(html).toContain('Create link')
  })

  it('shows a created link once with a copy button and says whether it can create accounts', () => {
    const yes = links({ created: { link: 'https://todo.example/invite/p/otp_abc', newAccounts: true } })
    expect(yes).toContain('shown only once')
    expect(yes).toContain('value="https://todo.example/invite/p/otp_abc"')
    expect(yes).toContain('Copy link')
    expect(yes).toContain('People without an account can create one')
    const no = links({ created: { link: 'https://todo.example/invite/p/otp_abc', newAccounts: false }, copied: true })
    expect(no).toContain('Copied')
    expect(no).toContain('Only people who already have an account')
  })

  it('lists pending links with role, email, creator and a labelled revoke button', () => {
    const html = links({ invites: [pending, { ...pending, id: 'i2', email: null, role: 'viewer' }] })
    expect(html).toContain('aria-label="Pending invite links"')
    expect(html).toContain('dora@example.com')
    expect(html).toContain('Anyone with the link')
    expect(html).toContain('created by Alice')
    expect(html).toContain('aria-label="Revoke the editor link for dora@example.com"')
  })

  it('disables creating and revoking offline and explains why', () => {
    const html = links({ open: true, offline: true, invites: [pending] })
    expect(html).toContain('need')
    expect(html).toContain('connection')
    expect(html).toMatch(/<button class="ui-btn ui-btn--primary[^"]*"[^>]*disabled=""/)
    expect(html).toMatch(/aria-label="Revoke[^"]*"[^>]*>Revoke|disabled=""[^>]*aria-label="Revoke/)
  })
})

// ---- acceptance screen ----

const preview: ProjectInvitePreview = {
  inviterName: 'Alice', projectName: 'Home', role: 'editor', email: null, expiresAt: Date.UTC(2026, 9, 8), canCreateAccount: true,
}
const bob: User = { id: 'u2', email: 'bob@example.com', name: 'Bob', role: 'member', createdAt: 0 }

function screen(state: ProjectInviteState, opts: { user?: User | null; join?: JoinState; step?: VisitorStep; form?: boolean } = {}): string {
  return renderToStaticMarkup(createElement(ProjectInviteView, {
    state, user: opts.user ?? null, join: opts.join ?? { kind: 'idle' }, step: opts.step ?? 'choose',
    form: opts.form ? createElement('form', { id: 'auth' }) : null,
    onRetry: noop, onJoin: noop, onSignIn: noop, onRegister: noop, onLogout: noop,
  }))
}

describe('ProjectInviteView', () => {
  it('shows inviter, project, role and expiry, and both choices when the link may create an account', () => {
    const html = screen({ kind: 'ready', preview })
    expect(html).toContain('Alice')
    expect(html).toContain('Home')
    expect(html).toContain('editor')
    expect(html).toContain('works once')
    expect(html).toContain('sign in to join')
    expect(html).toContain('Create an account')
    expect(html).not.toContain('data-testid="account-needed"')
  })

  it('offers only sign-in when the link may not create an account', () => {
    const html = screen({ kind: 'ready', preview: { ...preview, canCreateAccount: false } })
    expect(html).toContain('sign in to join')
    expect(html).not.toContain('Create an account')
    expect(html).toContain('need an account on this server first')
  })

  it('renders the sign-in or registration form once the visitor chose', () => {
    expect(screen({ kind: 'ready', preview }, { step: 'register', form: true })).toContain('id="auth"')
    expect(screen({ kind: 'ready', preview }, { step: 'signin', form: true })).toContain('id="auth"')
  })

  it('lets a signed-in person join', () => {
    const html = screen({ kind: 'ready', preview: { ...preview, alreadyMember: false } }, { user: bob })
    expect(html).toContain('Join project')
    expect(html).toContain('Signed in as <strong>Bob</strong>')
    expect(screen({ kind: 'ready', preview }, { user: bob, join: { kind: 'busy' } })).toContain('Joining…')
    expect(screen({ kind: 'ready', preview }, { user: bob, join: { kind: 'error', message: 'Nope' } })).toContain('Nope')
  })

  it('tells an existing member the link stays unused', () => {
    for (const html of [
      screen({ kind: 'ready', preview: { ...preview, alreadyMember: true } }, { user: bob }),
      screen({ kind: 'ready', preview }, { user: bob, join: { kind: 'already-member' } }),
    ]) {
      expect(html).toContain('already a member')
      expect(html).not.toContain('Join project')
    }
  })

  it('says whom to ask when the project is in a workspace the account is not in (workspaces 6.3)', () => {
    const html = screen({ kind: 'ready', preview: { ...preview, alreadyMember: false } }, { user: bob, join: { kind: 'not-in-workspace' } })
    expect(html).toContain('Ask the workspace owner to add you first')
    expect(html).not.toContain('Join project')
    expect(html).toContain('Back to my tasks')
  })

  it('warns when the link is bound to another email', () => {
    const html = screen({ kind: 'ready', preview: { ...preview, email: 'dora@example.com' } }, { user: bob })
    expect(html).toContain('issued for dora@example.com')
    expect(html).not.toContain('Join project')
    expect(html).toContain('Sign out')
  })

  it('explains invalid, offline and rate-limited links without a form', () => {
    expect(screen({ kind: 'invalid' })).toContain('no longer valid')
    expect(screen({ kind: 'offline' })).toContain('Retry now')
    expect(screen({ kind: 'rate-limited' })).toContain('Too many attempts')
    // A quick answer swaps no card: "Checking…" shows only after 400 ms (motion-polish D2).
    expect(screen({ kind: 'loading' })).toContain('aria-busy="true"')
    expect(screen({ kind: 'loading' })).not.toContain('Checking')
  })
})

describe('project registration form', () => {
  const status: AuthStatus = { setupRequired: false, signupAllowed: false, authenticated: false, user: null, version: 'test' }
  it('names the project, locks a bound email and offers sign-in instead', () => {
    const html = renderToStaticMarkup(createElement(AuthScreen, {
      status,
      invite: { token: 'otp_x', preview: { ...preview, email: 'dora@example.com' }, project: { name: 'Home', role: 'editor' }, onSignIn: noop },
      onAuthenticated: noop,
    }))
    expect(html).toContain('data-testid="project-invite-banner"')
    expect(html).toContain('Create account and join')
    expect(html).toContain('value="dora@example.com"')
    expect(html).toContain('readOnly=""')
    expect(html).toContain('Sign in to join')
  })
})

describe('owner switch', () => {
  it('shows the switch with its value, or an offline note', () => {
    const on = renderToStaticMarkup(createElement(ProjectInvitePolicyView, { value: true, busy: false, error: null, onChange: noop }))
    expect(on).toContain('Invite new people')
    expect(on).toContain('Members can invite new people with project links')
    expect(on).toMatch(/role="switch" aria-checked="true"/)
    expect(withoutLearnMore(on)).not.toContain('data-help-screen')
    const off = renderToStaticMarkup(createElement(ProjectInvitePolicyView, { value: null, busy: false, error: null, onChange: noop }))
    expect(off).toContain('available when you are online')
  })
})

describe('project invite route and pending link', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('parses /invite/p/<token> and round-trips through routePath', () => {
    expect(parseRoute('/invite/p/otp_abc-DEF_123')).toEqual({ view: 'project-invite', token: 'otp_abc-DEF_123' })
    expect(routePath({ view: 'project-invite', token: 'otp_abc' })).toBe('/invite/p/otp_abc')
    expect(parseRoute('/invite/p')).toEqual({ view: 'inbox' })
    expect(parseRoute('/invite/oti_abc')).toEqual({ view: 'invite', token: 'oti_abc' })
  })

  it('remembers a link across sign-in exactly once', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
    })
    rememberPendingInvite('otp_abc')
    expect(store.get(PENDING_PROJECT_INVITE)).toBe('otp_abc')
    expect(takePendingInvite()).toBe('otp_abc')
    expect(takePendingInvite()).toBeNull()
  })
})
