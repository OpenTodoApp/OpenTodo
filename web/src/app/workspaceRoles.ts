import type { WorkspaceRole } from '../lib/types'

/** Whether the role may manage members, groups and links (workspaces "Workspace membership and roles"). */
export const manages = (role: WorkspaceRole) => role === 'owner' || role === 'admin'
