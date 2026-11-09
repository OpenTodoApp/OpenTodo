// The part of the account a calendar sync connection or a CalDAV app password
// covers (OpenSpec change sync-scope, design D7): All, Only these or All except
// these, and the chosen workspaces, Inboxes and projects.
import { useMemo } from 'react'
import { Combobox, LabelChip, SegmentedControl } from '../ui'
import { useProjectsOfEveryWorkspace, useWorkspaceState } from '../lib/localData'
import { Partition } from '../lib/workspaces'
import type { SyncScope } from '../lib/types'
import { t } from '../lib/i18n'

export const allScope = (): SyncScope => ({ mode: 'all', workspaces: [], projects: [], inboxes: [] })

type Kind = 'workspaces' | 'inboxes' | 'projects'

interface Place {
  key: string
  kind: Kind
  id: string
  name: string
  color: string
  group: string
  path: string[]
}

const keyOf = (kind: Kind, id: string) => `${kind}:${id}`

/** Every place a scope can choose: per workspace, the workspace, its Inbox and its projects. */
export function useScopePlaces(): Place[] {
  const ws = useWorkspaceState()
  const projects = useProjectsOfEveryWorkspace()
  return useMemo(() => {
    const p = new Partition(ws.defaultId, ws.list.map((w) => w.id), projects)
    const byId = new Map(projects.map((x) => [x.id, x]))
    const several = ws.list.length > 1
    const out: Place[] = []
    for (const w of ws.list) {
      const prefix = several && !w.default ? `${w.name} · ` : ''
      if (several) out.push({ key: keyOf('workspaces', w.id), kind: 'workspaces', id: w.id, name: w.name, color: w.color || 'var(--color-faint)', group: w.name, path: [] })
      out.push({ key: keyOf('inboxes', w.id), kind: 'inboxes', id: w.id, name: prefix + t('Inbox'), color: 'var(--color-faint)', group: w.name, path: [] })
      for (const x of projects) {
        if (x.archived || p.project(x.id) !== w.id) continue
        const path: string[] = []
        for (let cur = x.parent_id ? byId.get(x.parent_id) : undefined; cur && path.length < 16; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined) path.unshift(cur.name)
        out.push({ key: keyOf('projects', x.id), kind: 'projects', id: x.id, name: x.name, color: x.color, group: w.name, path })
      }
    }
    return out
  }, [ws, projects])
}

/** The chosen places' names, for a row's meta line ("" for All). */
export function scopeSummary(scope: SyncScope | undefined, places: Place[]): string {
  if (!scope || scope.mode === 'all') return ''
  const chosen = new Set([...scope.workspaces.map((id) => keyOf('workspaces', id)), ...scope.inboxes.map((id) => keyOf('inboxes', id)), ...scope.projects.map((id) => keyOf('projects', id))])
  const names = places.filter((p) => chosen.has(p.key)).map((p) => p.name).join(', ')
  return scope.mode === 'except' ? t('All except {names}', { names }) : names
}

export function SyncScopeField({ label, value, onChange, disabled }: { label: string; value: SyncScope; onChange: (s: SyncScope) => void; disabled?: boolean }) {
  const places = useScopePlaces()
  const chosen = [...value.workspaces.map((id) => keyOf('workspaces', id)), ...value.inboxes.map((id) => keyOf('inboxes', id)), ...value.projects.map((id) => keyOf('projects', id))]
  const byKey = new Map(places.map((p) => [p.key, p]))
  const toggle = (p: Place) => {
    const list = value[p.kind]
    onChange({ ...value, [p.kind]: list.includes(p.id) ? list.filter((id) => id !== p.id) : [...list, p.id] })
  }
  return (
    <fieldset className="space-y-2" data-sync-scope>
      <legend className="text-body font-medium text-default">{label}</legend>
      <SegmentedControl label={label} value={value.mode} disabled={disabled} wrap
        options={[{ id: 'all', label: t('All') }, { id: 'only', label: t('Only these') }, { id: 'except', label: t('All except these') }]}
        onChange={(mode) => onChange({ ...value, mode })} />
      {value.mode !== 'all' && (
        <>
          {chosen.some((k) => byKey.has(k)) && (
            <ul className="flex flex-wrap gap-1" aria-label={label}>
              {chosen.filter((k) => byKey.has(k)).map((k) => {
                const p = byKey.get(k)!
                return <li key={k}><LabelChip name={p.name} color={p.color} onRemove={disabled ? undefined : () => toggle(p)} /></li>
              })}
            </ul>
          )}
          <Combobox label={label} placeholder={t('Find a workspace or project…')} source={places} getKey={(p: Place) => p.key}
            getLabel={(p: Place) => p.name} getGroup={(p: Place) => p.group} getPath={(p: Place) => p.path} multiple selected={chosen}
            renderLeading={(p: Place) => <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />}
            onPick={toggle} />
        </>
      )}
    </fieldset>
  )
}
