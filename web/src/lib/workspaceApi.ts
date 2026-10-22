// The workspace routes (OpenSpec change workspaces, http-api "Workspace
// routes"). Every change answers with the server's view, stored at once so the
// directory on this device is current before the next sync, and wakes the
// other devices through the server.
import { request } from './api'
import { syncNow } from './sync'
import type { Membership, ProjectRole, WorkspaceEntry, WorkspaceRole } from './types'
import { storeWorkspacesFromSync } from './workspaces'

const base = '/api/v1/workspaces'
const enc = encodeURIComponent

export interface WorkspaceInvite {
  id: string
  workspaceId: string
  role: WorkspaceRole
  email: string | null
  createdBy: string
  createdByName: string
  createdAt: number
  expiresAt: number
}

export interface WorkspaceInvitePreview {
  inviterName: string
  workspaceName: string
  role: WorkspaceRole
  email: string | null
  expiresAt: number
  canCreateAccount: boolean
  alreadyMember?: boolean
}

/** Reloads the directory after a change (the sync response carries it too). */
async function refresh(): Promise<void> {
  const list = await request<{ workspaces: WorkspaceEntry[] }>('GET', base)
  await storeWorkspacesFromSync(list.workspaces)
}

async function change<T>(run: () => Promise<T>): Promise<T> {
  const out = await run()
  await refresh()
  void syncNow()
  return out
}

export const workspaceApi = {
  list: () => request<{ workspaces: WorkspaceEntry[] }>('GET', base),
  create: (input: { name: string; icon?: string; color?: string }) => change(() => request<WorkspaceEntry>('POST', base, input)),
  update: (id: string, input: { name?: string; icon?: string; color?: string }) => change(() => request<WorkspaceEntry>('PATCH', `${base}/${enc(id)}`, input)),
  remove: (id: string) => change(() => request<void>('DELETE', `${base}/${enc(id)}`)),
  leave: (id: string) => change(() => request<void>('POST', `${base}/${enc(id)}/leave`)),
  transfer: (id: string, userId: string) => change(() => request<WorkspaceEntry>('POST', `${base}/${enc(id)}/transfer`, { userId })),
  addMember: (id: string, email: string, role: WorkspaceRole) => change(() => request<WorkspaceEntry>('POST', `${base}/${enc(id)}/members`, { email, role })),
  setRole: (id: string, userId: string, role: WorkspaceRole) => change(() => request<WorkspaceEntry>('PATCH', `${base}/${enc(id)}/members/${enc(userId)}`, { role })),
  removeMember: (id: string, userId: string) => change(() => request<void>('DELETE', `${base}/${enc(id)}/members/${enc(userId)}`)),
  createGroup: (id: string, name: string) => change(() => request<{ id: string; name: string; members: string[] }>('POST', `${base}/${enc(id)}/groups`, { name })),
  renameGroup: (id: string, groupId: string, name: string) => change(() => request<WorkspaceEntry>('PATCH', `${base}/${enc(id)}/groups/${enc(groupId)}`, { name })),
  deleteGroup: (id: string, groupId: string) => change(() => request<void>('DELETE', `${base}/${enc(id)}/groups/${enc(groupId)}`)),
  setGroupMember: (id: string, groupId: string, userId: string, member: boolean) =>
    change(() => request<WorkspaceEntry>(member ? 'PUT' : 'DELETE', `${base}/${enc(id)}/groups/${enc(groupId)}/members/${enc(userId)}`)),
  listInvites: (id: string) => request<{ invites: WorkspaceInvite[] }>('GET', `${base}/${enc(id)}/invites`),
  createInvite: (id: string, input: { role: WorkspaceRole; email?: string; expiresInHours?: number; send?: boolean }) =>
    request<{ invite: WorkspaceInvite; link: string; newAccounts: boolean; sent?: boolean }>('POST', `${base}/${enc(id)}/invites`, input),
  revokeInvite: (id: string, inviteId: string) => request<void>('DELETE', `${base}/${enc(id)}/invites/${enc(inviteId)}`),
  previewInvite: (token: string) => request<WorkspaceInvitePreview>('GET', `/api/v1/workspace-invites/${enc(token)}`),
  acceptInvite: (token: string) => change(() => request<{ workspaceId: string; role: WorkspaceRole }>('POST', `/api/v1/workspace-invites/${enc(token)}/accept`, {})),
  registerWithInvite: (email: string, name: string, password: string, token: string) =>
    request<{ user: { id: string }; workspaceId: string }>('POST', '/api/v1/auth/register', { email, name, password, workspaceInvite: token }),
  // Group grants on a project (project-sharing "Membership routes").
  grant: (projectId: string, groupId: string, role: Exclude<ProjectRole, 'owner'>) =>
    request<Membership>('POST', `/api/v1/projects/${enc(projectId)}/grants`, { groupId, role }),
  changeGrant: (projectId: string, groupId: string, role: Exclude<ProjectRole, 'owner'>) =>
    request<Membership>('PATCH', `/api/v1/projects/${enc(projectId)}/grants/${enc(groupId)}`, { role }),
  removeGrant: (projectId: string, groupId: string) => request<void>('DELETE', `/api/v1/projects/${enc(projectId)}/grants/${enc(groupId)}`),
}
