// The OpenTodo app's sign-ins (OpenSpec change native-app-foundation, design
// D5): the confirmation the app's sign-in sheet shows, and the signed-in apps
// listed with the sessions in Settings → Account. Only the lazily loaded
// consent and settings screens import this module.
import { request } from './api'

/** One signed-in app, as `GET /api/v1/me/apps` lists it. */
export interface AppSession {
  id: string
  device: string
  createdAt: number
  lastUsedAt: number
}

/** The app's built-in OAuth client: /app/sign-in hands its requests to the consent host with it. */
export const APP_CLIENT_ID = 'opentodo-app'

/** Where the confirmation sends the sheet: the app's own scheme. */
export const APP_REDIRECT = 'opentodo://signed-in'

export const listAppSessions = () => request<{ apps: AppSession[] }>('GET', '/api/v1/me/apps').then((r) => r.apps)

export const revokeAppSession = (id: string) => request<void>('DELETE', `/api/v1/me/apps/${encodeURIComponent(id)}`)

/** Confirms or cancels a sign-in request; the answer is the app address to open. */
export const answerAppSignIn = (query: string, allow: boolean) =>
  request<{ redirect: string }>('POST', '/api/v1/me/app-sign-in', { query, allow })

/** The device name the app sent with its sign-in request. */
export function appDevice(query: string): string {
  return (new URLSearchParams(query).get('device') ?? '').trim().slice(0, 100)
}
