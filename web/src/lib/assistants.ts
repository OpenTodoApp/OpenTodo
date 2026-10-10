// AI assistants (OpenSpec change `mcp-server`): the owner's toggle for the
// read-only MCP endpoint, API token scopes and the connection snippet shown in
// Settings. Server-side account data, cached locally for the offline view.
import { ApiError } from './api'
import { getMeta, setMeta } from './db'

export type TokenScope = 'full' | 'read'

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
  /** Absolute URL of the endpoint as the server sees itself. */
  endpoint: string
}

/** Label for a token's scope in the token list. */
export function scopeLabel(scope: TokenScope | undefined): string {
  return scope === 'read' ? 'read-only' : 'full access'
}

/**
 * Connection snippet for MCP clients that take a JSON server entry: the endpoint
 * URL plus the bearer header. The token placeholder is used when the secret is
 * not on screen (it is shown once, at creation).
 */
export function connectionSnippet(endpoint: string, token?: string | null): string {
  return JSON.stringify({
    mcpServers: {
      opentodo: { type: 'http', url: endpoint, headers: { Authorization: `Bearer ${token || '<your read-only token>'}` } },
    },
  }, null, 2)
}

export function describeAssistantsError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Only the server owner can turn the AI assistants endpoint on or off.'
    return err.message
  }
  return 'The server is unreachable. This setting lives on the server and needs a connection.'
}

const CACHE_KEY = 'assistants.status'

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
