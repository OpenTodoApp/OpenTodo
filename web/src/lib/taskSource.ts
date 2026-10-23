// Where an Inbox task came from (OpenSpec change inbox-split, design D4): the
// source line under each Inbox row ("From email · yesterday"). Read on the device
// from what the row already holds: the task's origin first (a mail, a web page, an
// issue, an import), else the device that wrote its creation (a calendar app, an AI
// assistant, the API, a Markdown vault). A task made in this app says nothing more
// than when it was added. No request, no new field.
import { t } from './i18n'
import type { Task } from './types'
import { originHost, originLabel, originOf } from './taskOrigin'

export type SourceKind = 'email' | 'web' | 'issue' | 'import' | 'calendar' | 'assistant' | 'api' | 'vault' | 'app'

export interface TaskSource {
  kind: SourceKind
  /** The sentence before the time: "From email", "From github.com", "Added by an AI assistant". */
  text: string
}

/** The device that wrote the task's creation: the clock of `created_at`, else of `title`. */
export function creatorDevice(task: Pick<Task, '_clock'>): string {
  const clock = task._clock ?? {}
  return clock.created_at?.device ?? clock.title?.device ?? ''
}

/** Where the task came from, for the Inbox's source line. */
export function taskSource(task: Pick<Task, 'origin' | '_clock'>): TaskSource {
  const origin = originOf(task)
  if (origin?.kind === 'email') {
    const via = originLabel(origin)
    return { kind: 'email', text: via ? t('From email ({via})', { via }) : t('From email') }
  }
  if (origin?.kind === 'issue') return { kind: 'issue', text: t('From {issue}', { issue: originLabel(origin) }) }
  if (origin?.kind === 'import') {
    return { kind: 'import', text: origin.provider ? t('Imported from {app}', { app: origin.provider }) : t('Imported') }
  }
  if (origin?.kind === 'url') {
    const host = originHost(origin)
    return { kind: 'web', text: host ? t('From {site}', { site: host }) : t('From a web page') }
  }
  const device = creatorDevice(task)
  if (device.startsWith('caldav:')) return { kind: 'calendar', text: t('From a calendar app') }
  if (device.startsWith('agent:') || device.startsWith('assistant:')) return { kind: 'assistant', text: t('Added by an AI assistant') }
  if (device === 'import') return { kind: 'import', text: t('Imported') }
  if (device.startsWith('vault:')) return { kind: 'vault', text: t('From a Markdown vault') }
  if (device === 'server' || device.startsWith('server:')) return { kind: 'api', text: t('Added through the API') }
  return { kind: 'app', text: t('Added') }
}
