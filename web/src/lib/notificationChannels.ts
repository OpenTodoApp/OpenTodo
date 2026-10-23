// Notification channels (OpenSpec change notification-channels): a person's
// ntfy, Pushover, Gotify and webhook channels. Server data, never ops: the
// list is read from the server and kept in the meta table for the offline card.
// Secrets go up once and never come back, except a webhook's signing secret,
// returned once on creation or rotation.
import { request } from './api'
import { getMeta, setMeta } from './db'
import { currentLanguage } from './i18n'

export type ChannelKind = 'ntfy' | 'pushover' | 'gotify' | 'webhook'
export type ChannelEvent = 'reminder' | 'assigned' | 'mentioned' | 'unblocked' | 'page'

export const CHANNEL_KINDS: readonly ChannelKind[] = ['ntfy', 'pushover', 'gotify', 'webhook']
export const CHANNEL_EVENTS: readonly ChannelEvent[] = ['reminder', 'assigned', 'mentioned', 'unblocked', 'page']
export const MAX_CHANNELS = 5
export const NTFY_DEFAULT = 'https://ntfy.sh'

export interface NotificationChannel {
  id: string
  kind: ChannelKind
  name: string
  url?: string
  topic?: string
  events: ChannelEvent[]
  includeTitles: boolean
  enabled: boolean
  disabledReason?: string
  lang: string
  tokenSet: boolean
  userKeySet?: boolean
  secretSet?: boolean
  lastOkAt: number | null
  lastError?: string
  failures: number
  createdAt: number
  updatedAt: number
}

export interface ChannelInput {
  kind?: ChannelKind
  name?: string
  url?: string
  topic?: string
  token?: string
  userKey?: string
  events?: ChannelEvent[]
  includeTitles?: boolean
  enabled?: boolean
  lang?: string
  origin?: string
  rotateSecret?: boolean
}

export interface ChannelTestResult {
  delivered: boolean
  statusCode?: number
  error?: string
}

/** Every create and update carries the app's language and address (design D5). */
function withContext(body: ChannelInput): ChannelInput {
  return { ...body, lang: currentLanguage(), origin: typeof location === 'undefined' ? undefined : location.origin }
}

const path = (id: string) => `/api/v1/notification-channels/${encodeURIComponent(id)}`

export const channelsApi = {
  getSetting: () => request<{ enabled: boolean }>('GET', '/api/v1/settings/notification-channels'),
  putSetting: (enabled: boolean) => request<{ enabled: boolean }>('PUT', '/api/v1/settings/notification-channels', { enabled }),
  list: () => request<{ channels: NotificationChannel[] }>('GET', '/api/v1/notification-channels'),
  create: (body: ChannelInput) => request<{ channel: NotificationChannel; secret?: string }>('POST', '/api/v1/notification-channels', withContext(body)),
  update: (id: string, body: ChannelInput) => request<{ channel: NotificationChannel; secret?: string }>('PATCH', path(id), withContext(body)),
  remove: (id: string) => request<void>('DELETE', path(id)),
  test: (id: string) => request<ChannelTestResult>('POST', `${path(id)}/test`),
}

const CACHE_KEY = 'notificationChannels'

/** The channels of the last load, for the offline card. */
export function cachedChannels(): Promise<NotificationChannel[]> {
  return getMeta<NotificationChannel[]>(CACHE_KEY, [])
}

export function cacheChannels(list: NotificationChannel[]): Promise<void> {
  return setMeta(CACHE_KEY, list)
}
