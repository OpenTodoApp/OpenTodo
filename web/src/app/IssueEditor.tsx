// The issue connection editor (OpenSpec change issue-import, design D13; issue-connections
// "Connection editor"): provider, host, the token as a password field that is never
// prefilled ("Replace token" when editing), the filter, the target project through the
// project picker, label mapping and the interval. The server's validation error is shown
// beside the field it names.
import type { ReactNode } from 'react'
import { Button, Dialog, Field, Input, Notice, Select, Switch } from '../ui'
import type { IssueConnection, IssueConnectionInput, Project } from '../lib/types'
import { t } from '../lib/i18n'
import { ProjectPickerField } from './ProjectPickerField'

export interface IssueDraft {
  id?: string
  provider: 'github' | 'gitlab'
  host: string
  /** Typed in this dialog only; never filled from the server. */
  token: string
  name: string
  projectId: string | null
  scope: 'assigned' | 'repositories'
  repositories: string
  labels: string
  mapLabels: boolean
  interval: number
}

/** The field an error belongs to, and its message. */
export interface FieldErrorState {
  field: string
  message: string
}

export const DEFAULT_HOSTS = { github: 'https://github.com', gitlab: 'https://gitlab.com' } as const
export const INTERVALS = [15, 30, 60, 360, 1440] as const
const MAX_REPOSITORIES = 20
const MAX_LABELS = 10

export function newDraft(): IssueDraft {
  return { provider: 'github', host: DEFAULT_HOSTS.github, token: '', name: '', projectId: null, scope: 'assigned', repositories: '', labels: '', mapLabels: false, interval: 30 }
}

export function draftOf(c: IssueConnection): IssueDraft {
  return {
    id: c.id, provider: c.provider, host: c.host, token: '', name: c.name, projectId: c.project_id, scope: c.filter.scope,
    repositories: c.filter.repositories.join(', '), labels: c.filter.labels.join(', '), mapLabels: c.map_labels, interval: c.interval_minutes,
  }
}

const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

/** Checks the counts the server enforces, so the dialog can say so before a request. */
export function draftError(d: IssueDraft): FieldErrorState | null {
  if (!d.host.trim()) return { field: 'host', message: t('Enter the address of GitHub, GitLab or your own instance.') }
  if (!d.id && !d.token.trim()) return { field: 'token', message: t('Paste a personal access token.') }
  if (d.scope === 'repositories' && list(d.repositories).length === 0) return { field: 'repositories', message: t('List at least one repository or project.') }
  if (list(d.repositories).length > MAX_REPOSITORIES) return { field: 'repositories', message: t('List at most {n} repositories or projects.', { n: MAX_REPOSITORIES }) }
  if (list(d.labels).length > MAX_LABELS) return { field: 'labels', message: t('List at most {n} labels.', { n: MAX_LABELS }) }
  return null
}

/** The request body of a draft; the token only when one was typed. */
export function draftBody(d: IssueDraft): IssueConnectionInput {
  const body: IssueConnectionInput = {
    host: d.host.trim(), name: d.name.trim(), project_id: d.projectId, map_labels: d.mapLabels, interval_minutes: d.interval,
    filter: { scope: d.scope, repositories: d.scope === 'repositories' ? list(d.repositories) : [], labels: list(d.labels) },
  }
  if (!d.id) body.provider = d.provider
  if (d.token.trim()) body.token = d.token.trim()
  return body
}

export function intervalLabel(m: number): string {
  return m < 60 ? t('Every {m} minutes', { m }) : m === 60 ? t('Every hour') : m < 1440 ? t('Every {h} hours', { h: m / 60 }) : t('Once a day')
}

/** Where a provider's user creates a token that can read issues. */
export function tokenPage(d: Pick<IssueDraft, 'provider' | 'host'>): string {
  const host = d.host.trim().replace(/\/+$/, '') || DEFAULT_HOSTS[d.provider]
  return d.provider === 'github' ? `${host}/settings/tokens` : `${host}/-/user_settings/personal_access_tokens`
}

/** "More options" opens by itself when label mapping or the interval differs from its default. */
export function moreOptionsOpen(d: IssueDraft): boolean {
  return d.mapLabels || d.interval !== newDraft().interval || !!d.name.trim()
}

export interface IssueEditorProps {
  draft: IssueDraft
  projects: readonly Project[]
  busy: boolean
  connected: boolean
  error: FieldErrorState | null
  /** An error that names no field. */
  general: string | null
  onChange: (d: IssueDraft) => void
  onSave: () => void
  onClose: () => void
  /** Tests the stored connection's token (only for a saved connection). */
  onTest?: () => void
}

/** One numbered step of the editor. */
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3" aria-labelledby={`issue-step-${n}`} data-issue-step={n}>
      <h3 id={`issue-step-${n}`} className="flex items-center gap-2 text-body font-semibold text-default">
        <span aria-hidden className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-meta text-on-accent-soft">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  )
}

/** Step 1: the provider as two choices and the host, editable for GitLab or a host that is not the default. */
function WhereStep({ d, set, at }: { d: IssueDraft; set: (p: Partial<IssueDraft>) => void; at: (f: string) => string | undefined }) {
  const fixedHost = d.provider === 'github' && d.host === DEFAULT_HOSTS.github
  return (
    <Step n={1} title={t('Where')}>
      <div role="radiogroup" aria-label={t('Provider')} className="flex gap-2">
        {(['github', 'gitlab'] as const).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={d.provider === p} disabled={!!d.id} data-issue-provider={p}
            className={`flex-1 rounded-control border px-3 py-2 text-body font-medium ${d.provider === p ? 'border-accent bg-accent-soft text-on-accent-soft' : 'border-default text-default hover:bg-sunken'} disabled:opacity-60`}
            onClick={() => set({ provider: p, host: d.host === DEFAULT_HOSTS[d.provider] ? DEFAULT_HOSTS[p] : d.host })}>
            {p === 'github' ? 'GitHub' : 'GitLab'}
          </button>
        ))}
      </div>
      <Field label={t('Host')} description={fixedHost ? t('GitHub’s public service.') : t('gitlab.com or the address of your own instance.')} error={at('host')}>
        <Input aria-label={t('Host')} type="url" value={d.host} readOnly={fixedHost} onChange={(e) => set({ host: e.target.value })} />
      </Field>
    </Step>
  )
}

/** Step 3's filter and "More options" (name, label mapping, interval). */
function FilterFields({ d, set, at }: { d: IssueDraft; set: (p: Partial<IssueDraft>) => void; at: (f: string) => string | undefined }) {
  return (
    <>
      <Field label={t('Issues')} error={at('scope')}>
        <Select aria-label={t('Which issues')} value={d.scope} onChange={(e) => set({ scope: e.target.value as IssueDraft['scope'] })}>
          <option value="assigned">{t('Assigned to you')}</option>
          <option value="repositories">{t('Assigned to you in these repositories')}</option>
        </Select>
      </Field>
      {d.scope === 'repositories' && (
        <Field label={t('Repositories or projects')} description={t('Comma-separated, up to {n}.', { n: MAX_REPOSITORIES })} error={at('repositories')}>
          <Input aria-label={t('Repositories or projects')} placeholder="acme/web, acme/api" value={d.repositories} onChange={(e) => set({ repositories: e.target.value })} />
        </Field>
      )}
      <Field label={t('Only with these labels')} description={t('Comma-separated, up to {n}; an issue needs all of them.', { n: MAX_LABELS })} error={at('labels')}>
        <Input aria-label={t('Only with these labels')} value={d.labels} onChange={(e) => set({ labels: e.target.value })} />
      </Field>
    </>
  )
}

function MoreOptions({ d, set, at }: { d: IssueDraft; set: (p: Partial<IssueDraft>) => void; at: (f: string) => string | undefined }) {
  return (
    <details className="group rounded-control border border-default px-3 py-2" open={moreOptionsOpen(d) || !!at('name') || !!at('interval_minutes')} data-issue-more>
      <summary className="cursor-pointer text-body font-medium text-default">{t('More options')}</summary>
      <div className="mt-3 space-y-4">
        <Field label={t('Name')} description={t('Optional; the host is used otherwise.')} error={at('name')}>
          <Input aria-label={t('Connection name')} value={d.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Switch checked={d.mapLabels} onChange={(mapLabels) => set({ mapLabels })} label={t('Use issue labels as labels')} />
        <Field label={t('Check for changes')} error={at('interval_minutes')}>
          <Select aria-label={t('Check for changes')} value={String(d.interval)} onChange={(e) => set({ interval: Number(e.target.value) })}>
            {INTERVALS.map((m) => <option key={m} value={m}>{intervalLabel(m)}</option>)}
          </Select>
        </Field>
      </div>
    </details>
  )
}

/**
 * The editor in three numbered steps (settings-refresh D9; issue-connections
 * "Connection editor"): Where, Access, Which issues and where they go, with
 * "More options" for the name, label mapping and the interval, and Test and Save
 * in a bar that stays visible while the steps scroll.
 */
export function IssueEditor({ draft: d, projects, busy, connected, error, general, onChange, onSave, onClose, onTest }: IssueEditorProps) {
  const at = (field: string) => (error?.field === field ? error.message : undefined)
  const set = (patch: Partial<IssueDraft>) => onChange({ ...d, ...patch })
  return (
    <Dialog title={d.id ? t('Edit issue connection') : t('Connect issues')} onClose={onClose} size="lg" testId="issue-editor">
      <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); onSave() }} noValidate>
        <WhereStep d={d} set={set} at={at} />
        <Step n={2} title={t('Access')}>
          <Field label={d.id ? t('Replace token') : t('Token')} error={at('token')}
            description={<>{d.id ? t('Leave empty to keep the stored token. It is never shown again.') : d.provider === 'github' ? t('A token with read access to issues (classic: the repo scope). It is never shown again.') : t('A token with the read_api scope. It is never shown again.')}{' '}
              <a href={tokenPage(d)} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">{t('Create a token')}</a></>}>
            <Input aria-label={d.id ? t('Replace token') : t('Token')} type="password" autoComplete="off" spellCheck={false} value={d.token}
              onChange={(e) => set({ token: e.target.value })} />
          </Field>
        </Step>
        <Step n={3} title={t('Which issues and where they go')}>
          <Field label={t('Add tasks to')} error={at('project_id')}>
            <ProjectPickerField label={t('Add tasks to')} projects={projects} value={d.projectId} rankContext="issues.target" onChange={(projectId) => set({ projectId })} />
          </Field>
          <FilterFields d={d} set={set} at={at} />
        </Step>
        <MoreOptions d={d} set={set} at={at} />
        {general && <Notice tone="danger">{general}</Notice>}
        <div className="sticky -bottom-4 -mx-4 flex justify-end gap-2 border-t border-default bg-surface px-4 py-3" data-issue-actions>
          <Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="secondary" disabled={!connected || !d.id || !onTest} onClick={onTest} data-issue-test
            title={d.id ? undefined : t('Save the connection first, then test it.')}>{t('Test')}</Button>
          <Button variant="primary" type="submit" busy={busy} disabled={!connected}>{d.id ? t('Save') : t('Connect')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
