// All workspaces, or only chosen ones (OpenSpec change token-workspaces): the
// choice of a new API token and of an app's consent, so a token or an app for
// work stays out of the rest of the account.
import { Checkbox, RadioGroup } from '../ui'
import { t } from '../lib/i18n'
import { useWorkspaceState } from '../lib/localData'
import { workspaceLabel } from './workspaceNav'

/** The account's workspaces by name, for the choice. */
export function useWorkspaceChoices(): { id: string; name: string }[] {
  return useWorkspaceState().list.map((w) => ({ id: w.id, name: workspaceLabel(w.name, w.default) }))
}

/** All workspaces, or only the chosen ones (token-workspaces): a token for work stays out of the rest. */
export function WorkspaceChoice({ workspaces, only, onChange }: { workspaces: { id: string; name: string }[]; only: string[] | null; onChange: (only: string[] | null) => void }) {
  return (
    <div className="space-y-2" data-token-workspace-choice>
      <RadioGroup label={t('Workspaces')} name="token-workspaces" dataKey="token-workspaces" value={only ? 'only' : 'all'}
        onChange={(v) => onChange(v === 'all' ? null : [])}
        options={[{ value: 'all', label: t('All workspaces') }, { value: 'only', label: t('Only these') }]} />
      {only && (
        <div className="space-y-1 ps-6" role="group" aria-label={t('Workspaces')}>
          {workspaces.map((w) => (
            <Checkbox key={w.id} label={w.name} checked={only.includes(w.id)} data-token-workspace={w.id}
              onChange={(e) => onChange(e.target.checked ? [...only, w.id] : only.filter((id) => id !== w.id))} />
          ))}
        </div>
      )}
    </div>
  )
}

