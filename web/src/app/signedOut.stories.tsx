import type { Meta, StoryObj } from '@storybook/react-vite'
import type { AuthStatus, InvitationPreview, PendingSignup, ProjectInvitePreview, ResetPreview } from '../lib/types'
import type { WorkspaceInvitePreview } from '../lib/workspaceApi'
import { AuthScreen } from './AuthScreen'
import { ConfirmEmailScreen, ForgotScreen, VerifyScreen } from './EmailScreens'
import { InviteScreen } from './InviteScreen'
import { ProjectInviteScreen } from './ProjectInviteScreen'
import { ResetScreen } from './ResetScreen'
import { WorkspaceInviteScreen } from './WorkspaceInviteScreen'
import { answerRequests, storyUser, withClock } from './stories/fixtures'

// Rare screens (OpenSpec change screen-stories-rare, design D2, D3): the screens a
// visitor sees before or instead of the app. Screens that read a preview by token
// get it from `answerRequests`; an expired link answers as the server does.
const meta: Meta = { title: 'Screens/Signed out', decorators: [withClock], parameters: { layout: 'fullscreen' } }
export default meta

const noop = () => {}
const EXPIRES = Date.parse('2026-10-21T12:00:00')
const status: AuthStatus = { setupRequired: false, signupAllowed: true, authenticated: false, user: null, version: '0.9.0', outgoingEmail: { enabled: true } }
const invalid = (code: string) => ({ status: 404, body: { error: { code, message: 'This link is not valid any more.' } } })
const answer = (routes: Parameters<typeof answerRequests>[0] = {}) => () => { answerRequests(routes) }

const reset: ResetPreview = { email: 'ada@example.com', expiresAt: EXPIRES }
const pending: PendingSignup = { email: 'grace@example.com', expiresAt: EXPIRES }
const invitation: InvitationPreview = { inviterName: 'Robin Owner', email: 'grace@example.com', expiresAt: EXPIRES }
const projectInvite: ProjectInvitePreview = { inviterName: 'Robin Owner', email: null, expiresAt: EXPIRES, projectName: 'Website launch', role: 'editor', canCreateAccount: true }
const workspaceInvite: WorkspaceInvitePreview = { inviterName: 'Robin Owner', workspaceName: 'Northwind', role: 'member', email: null, expiresAt: EXPIRES, canCreateAccount: true }

/** Sign-in with sign-up open and email actions on. */
export const SignIn: StoryObj = { beforeEach: answer(), render: () => <AuthScreen status={status} onAuthenticated={noop} /> }

/** The first visit: the owner account is created with the code from the server log. */
export const OwnerSetup: StoryObj = {
  beforeEach: answer(),
  render: () => <AuthScreen status={{ ...status, setupRequired: true, setupCodeRequired: true }} onAuthenticated={noop} />,
}

/** Forgot password: the address to send a reset link to. */
export const Forgot: StoryObj = { beforeEach: answer(), render: () => <ForgotScreen enabled user={null} /> }

/** A reset link: the account's address and the new password. */
export const Reset: StoryObj = {
  beforeEach: answer({ '/api/v1/password-resets/': { body: reset } }),
  render: () => <ResetScreen token="otr_story" user={null} onDone={noop} onLogout={noop} />,
}

/** An expired reset link, as the audit tour opens it. */
export const ResetExpired: StoryObj = {
  beforeEach: answer({ '/api/v1/password-resets/': invalid('reset_invalid') }),
  render: () => <ResetScreen token="expired-token" user={null} onDone={noop} onLogout={noop} />,
}

/** A sign-up confirmation link: the pending address and Create my account. */
export const Verify: StoryObj = {
  beforeEach: answer({ '/api/v1/auth/verify/': { body: pending } }),
  render: () => <VerifyScreen token="otv_story" user={null} onDone={noop} onLogout={noop} />,
}

/** An expired confirmation link. */
export const VerifyExpired: StoryObj = {
  beforeEach: answer({ '/api/v1/auth/verify/': invalid('verification_invalid') }),
  render: () => <VerifyScreen token="expired-token" user={null} onDone={noop} onLogout={noop} />,
}

/** The link sent to a new email address, opened signed in. */
export const ConfirmEmail: StoryObj = { beforeEach: answer(), render: () => <ConfirmEmailScreen token="otc_story" onDone={noop} /> }

/** An account invitation for a given address. */
export const Invite: StoryObj = {
  beforeEach: answer({ '/api/v1/invitations/': { body: invitation } }),
  render: () => <InviteScreen token="oti_story" user={null} status={status} onAccepted={noop} onLogout={noop} />,
}

/** An expired account invitation. */
export const InviteExpired: StoryObj = {
  beforeEach: answer({ '/api/v1/invitations/': invalid('invitation_invalid') }),
  render: () => <InviteScreen token="expired-token" user={null} status={status} onAccepted={noop} onLogout={noop} />,
}

/** A project invite link opened signed out: sign in or create an account to join. */
export const ProjectInvite: StoryObj = {
  beforeEach: answer({ '/api/v1/project-invites/': { body: projectInvite } }),
  render: () => <ProjectInviteScreen token="otp_story" user={null} status={status} onAuthenticated={noop} onLogout={noop} />,
}

/** The same link opened by someone already on the project. */
export const ProjectInviteMember: StoryObj = {
  beforeEach: answer({ '/api/v1/project-invites/': { body: { ...projectInvite, alreadyMember: true } } }),
  render: () => <ProjectInviteScreen token="otp_story" user={storyUser} status={null} onAuthenticated={noop} onLogout={noop} />,
}

/** A workspace invite link opened signed out. */
export const WorkspaceInvite: StoryObj = {
  beforeEach: answer({ '/api/v1/workspace-invites/': { body: workspaceInvite } }),
  render: () => <WorkspaceInviteScreen token="otw_story" user={null} status={status} onAuthenticated={noop} />,
}

/** An expired workspace invite link, as the audit tour opens it. */
export const WorkspaceInviteExpired: StoryObj = {
  beforeEach: answer({ '/api/v1/workspace-invites/': invalid('invitation_invalid') }),
  render: () => <WorkspaceInviteScreen token="expired-token" user={null} status={status} onAuthenticated={noop} />,
}
