// The issue connection editor (OpenSpec change issue-import, design D13; issue-connections
// "Connection editor"): provider, host, the token as a password field that is never
// prefilled ("Replace token" when editing), the filter, the target project through the
// project picker, label mapping and the interval. The server's validation error is shown
// beside the field it names.
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
}

export function IssueEditor({ draft: d, projects, busy, connected, error, general, onChange, onSave, onClose }: IssueEditorProps) {
  const at = (field: string) => (error?.field === field ? error.message : undefined)
  const set = (patch: Partial<IssueDraft>) => onChange({ ...d, ...patch })
  return (
    <Dialog title={d.id ? t('Edit issue connection') : t('Connect issues')} onClose={onClose} size="md" testId="issue-editor">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSave() }} noValidate>
        <Field label={t('Provider')}>
          <Select aria-label={t('Provider')} value={d.provider} disabled={!!d.id}
            onChange={(e) => {
              const provider = e.target.value as IssueDraft['provider']
              const host = d.host === DEFAULT_HOSTS[d.provider] ? DEFAULT_HOSTS[provider] : d.host
              set({ provider, host })
            }}>
            <option value="github">GitHub</option>
            <option value="gitlab">GitLab</option>
          </Select>
        </Field>
        <Field label={t('Host')} description={t('github.com, gitlab.com or the address of your own instance.')} error={at('host')}>
          <Input aria-label={t('Host')} type="url" value={d.host} onChange={(e) => set({ host: e.target.value })} data-autofocus />
        </Field>
        <Field label={d.id ? t('Replace token') : t('Token')} error={at('token')}
          description={d.id ? t('Leave empty to keep the stored token. It is never shown again.') : t('A personal access token that can read issues. It is never shown again.')}>
          <Input aria-label={d.id ? t('Replace token') : t('Token')} type="password" autoComplete="off" spellCheck={false} value={d.token}
            onChange={(e) => set({ token: e.target.value })} />
        </Field>
        <Field label={t('Name')} description={t('Optional; the host is used otherwise.')} error={at('name')}>
          <Input aria-label={t('Connection name')} value={d.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} />
        </Field>
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
        <Field label={t('Add tasks to')} error={at('project_id')}>
          <ProjectPickerField label={t('Add tasks to')} projects={projects} value={d.projectId} rankContext="issues.target" onChange={(projectId) => set({ projectId })} />
        </Field>
        <Switch checked={d.mapLabels} onChange={(mapLabels) => set({ mapLabels })} label={t('Use issue labels as labels')} />
        <Field label={t('Check for changes')} error={at('interval_minutes')}>
          <Select aria-label={t('Check for changes')} value={String(d.interval)} onChange={(e) => set({ interval: Number(e.target.value) })}>
            {INTERVALS.map((m) => <option key={m} value={m}>{intervalLabel(m)}</option>)}
          </Select>
        </Field>
        {general && <Notice tone="danger">{general}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="primary" type="submit" busy={busy} disabled={!connected}>{d.id ? t('Save') : t('Connect')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
