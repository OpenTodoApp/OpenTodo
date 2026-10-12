// AI assistants (OpenSpec changes `mcp-server`, `mcp-write-tools`): the owner's
// switches for the MCP endpoint and for assistant writes, the user's own
// "Allow AI assistants to make changes" switch, API token scopes and the
// connection snippet shown in Settings. Server-side account data, cached
// locally for the offline view.
import { ApiError } from './api'
import { getMeta, setMeta } from './db'

/** `agent`: an assistant token that can make changes through MCP write tools only. */
export type TokenScope = 'full' | 'read' | 'agent'

export interface ApiToken {
  id: string
  name: string
  /** Absent on servers from before token scopes: those tokens are full. */
  scope?: TokenScope
  createdAt: number
  lastUsedAt: number | null
}

export interface McpStatus {
  enabled: boolean
  /** The owner allows assistant writes (absent on older servers: off). */
  writes_enabled?: boolean
  /** Absolute URL of the endpoint as the server sees itself. */
  endpoint: string
}

/** The user's own switch, GET/PUT /api/v1/me/agent-access. */
export interface AgentAccess {
  allow_writes: boolean
  owner_allows_writes: boolean
}

/** Label for a token's scope in the token list. */
export function scopeLabel(scope: TokenScope | undefined): string {
  if (scope === 'agent') return 'assistant, can make changes'
  return scope === 'read' ? 'read-only' : 'full access'
}

/** Whether an assistant token that can make changes may be offered. */
export function writesAllowed(status: McpStatus | null, access: AgentAccess | null): boolean {
  return !!status?.enabled && !!status.writes_enabled && !!access?.allow_writes
}

/**
 * Connection snippet for MCP clients that take a JSON server entry: the endpoint
 * URL plus the bearer header. The token placeholder is used when the secret is
 * not on screen (it is shown once, at creation).
 */
export function connectionSnippet(endpoint: string, token?: string | null): string {
  return JSON.stringify({
    mcpServers: {
      opentodo: { type: 'http', url: endpoint, headers: { Authorization: `Bearer ${token || '<your token>'}` } },
    },
  }, null, 2)
}

export function describeAssistantsError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403 && err.code === 'insufficient_scope') return 'Only you can change this, signed in to the app.'
    if (err.status === 403) return 'Only the server owner can change the AI assistants settings of this server.'
    return err.message
  }
  return 'The server is unreachable. This setting lives on the server and needs a connection.'
}

const CACHE_KEY = 'assistants.status'
const ACCESS_KEY = 'assistants.access'

/** Last fetched status, for the offline view (cleared on sign-out with the meta table). */
export async function loadCachedStatus(): Promise<McpStatus | null> {
  try {
    return await getMeta<McpStatus | null>(CACHE_KEY, null)
  } catch {
    return null
  }
}

export async function cacheStatus(status: McpStatus): Promise<void> {
  try {
    await setMeta(CACHE_KEY, status)
  } catch {
    // Caching is a convenience; ignore storage failures.
  }
}

/** Last fetched agent access switch, for the offline view. */
export async function loadCachedAccess(): Promise<AgentAccess | null> {
  try {
    return await getMeta<AgentAccess | null>(ACCESS_KEY, null)
  } catch {
    return null
  }
}

export async function cacheAccess(access: AgentAccess): Promise<void> {
  try {
    await setMeta(ACCESS_KEY, access)
  } catch {
    // Caching is a convenience; ignore storage failures.
  }
}
