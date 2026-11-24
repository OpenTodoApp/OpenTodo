// The AI apps a person connected over OAuth (OpenSpec change
// connected-apps-list), listed with the sessions in Settings → Account so they
// can be disconnected. Only the lazily loaded settings screens import this module.
import { request } from './api'

/** One connected app, as `GET /api/v1/me/oauth-grants` lists it. */
export interface ConnectedApp {
  id: string
  clientId: string
  clientName: string
  scope: 'read' | 'agent'
  /** The workspaces it is limited to; empty for every workspace. */
  workspaces: string[]
  createdAt: number
  lastUsedAt: number | null
}

export const listConnectedApps = () => request<{ grants: ConnectedApp[] }>('GET', '/api/v1/me/oauth-grants').then((r) => r.grants)

export const disconnectApp = (id: string) => request<void>('DELETE', `/api/v1/me/oauth-grants/${encodeURIComponent(id)}`)
