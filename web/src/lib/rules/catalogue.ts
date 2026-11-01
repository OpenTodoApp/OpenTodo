// The step catalogue's availability on this device (OpenSpec change
// routines-editor, design D7): fetched from GET /api/v1/me/rules/catalogue,
// cached per device and refreshed after a sync; offline the cache decides.
import { useEffect, useState } from 'react'
import { api } from '../api'
import { readJSON, writeJSON } from '../deviceStorage'
import { msg, t } from '../i18n'
import { useOnline } from '../online'
import { resettable } from '../moduleState'
import { useSyncStatus } from '../sync'
import type { RoutineCatalogueEntry } from '../types'

const KEY = 'routines.catalogue'
const REFRESH_MS = 60_000

export type Catalogue = Record<string, RoutineCatalogueEntry>

const accept = (v: unknown): Catalogue | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Catalogue) : null)

export const cachedCatalogue = (): Catalogue | null => readJSON<Catalogue | null>(KEY, null, accept)

let fetchedAt = 0
let inflight: Promise<Catalogue | null> | null = null

/** Forgets when the catalogue was fetched (tests, sign-out). */
export function resetCatalogueCache(): void { fetchedAt = 0; inflight = null }
resettable('routineCatalogue', resetCatalogueCache)

/** Fetches the catalogue (at most once a minute) and caches it. */
export function refreshCatalogue(force = false): Promise<Catalogue | null> {
  if (!force && (inflight || Date.now() - fetchedAt < REFRESH_MS)) return inflight ?? Promise.resolve(cachedCatalogue())
  inflight = api.routineCatalogue().then((r) => {
    const out: Catalogue = {}
    for (const e of r.steps) out[e.kind] = { kind: e.kind, group: e.group, available: e.available, ...(e.reason ? { reason: e.reason } : {}), ...(e.setting ? { setting: e.setting } : {}) }
    writeJSON(KEY, out)
    fetchedAt = Date.now()
    return out
  }, () => cachedCatalogue()).finally(() => { inflight = null })
  return inflight
}

/** The catalogue as last known on this device, refreshed after each sync while online. */
export function useCatalogue(): Catalogue | null {
  const online = useOnline()
  const synced = useSyncStatus().lastSyncedAt
  const [cat, setCat] = useState<Catalogue | null>(cachedCatalogue)
  useEffect(() => {
    if (!online) return
    let live = true
    refreshCatalogue().then((c) => { if (live && c) setCat(c) })
    return () => { live = false }
  }, [online, synced])
  return cat
}

/** Whether a kind can be used now; unknown (no catalogue yet) counts as available. */
export const isAvailable = (cat: Catalogue | null, kind: string): boolean => !cat || !cat[kind] || cat[kind].available

const REASON: Record<string, string> = {
  automations_off: msg('automations are turned off on this server'),
  email_not_configured: msg('outgoing email is not set up on this server'),
  email_not_verified: msg('your email address is not verified'),
  encrypted: msg('email cannot be built for an encrypted account'),
  no_webhook: msg('the webhook does not exist or is turned off'),
  energy_off: msg('Energy levels are turned off'),
  focus_off: msg('today’s focus is turned off'),
  time_tracking_off: msg('time tracking is turned off'),
  not_shared: msg('the routine does not belong to a shared project'),
  demo: msg('not offered on a demo instance'),
}

const HINT: Record<string, string> = {
  automations_off: msg('Ask the server owner to turn on automations'),
  email_not_configured: msg('Set up email to use this'),
  email_not_verified: msg('Verify your email address to use this'),
  no_webhook: msg('Add a webhook to use this'),
  energy_off: msg('Turn on Energy levels to use this'),
  focus_off: msg('Turn on today’s focus to use this'),
  time_tracking_off: msg('Turn on time tracking to use this'),
}

/** Why a step is not available, as a sentence. */
export const reasonText = (reason: string | undefined): string => (reason && REASON[reason] ? t(REASON[reason]) : t('not available here'))

/** The short hint the Add step search shows ("Set up email to use this"). */
export const reasonHint = (reason: string | undefined): string => (reason && HINT[reason] ? t(HINT[reason]) : reasonText(reason))

/** The settings page that fixes a reason (the catalogue's `setting`), as a route path; '' when none can. */
export function settingPath(setting: string | undefined): string {
  if (!setting) return ''
  const [area] = setting.split('.')
  switch (area) {
    case 'server': return '/settings/server'
    case 'account': return '/settings/account'
    case 'integrations': return '/settings/integrations'
    case 'how_you_work': return '/settings/general'
  }
  return ''
}
