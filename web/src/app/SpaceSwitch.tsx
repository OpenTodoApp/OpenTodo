// The sidebar's space switch (OpenSpec change notes-space, design D1, D2): Tasks or
// Notes under the workspace control. Choosing a space opens its home; the rail shows
// the two as icons named in their tooltips.
import { Icon, SegmentedControl, Tooltip } from '../ui'
import { setSpace, type Space } from '../lib/sidebarSpace'
import { t } from '../lib/i18n'
import { navigate } from './router'
import { openStartView } from './startView'

/** Shows `space` and opens its home: the start view for Tasks, the Notes page for Notes. */
export function chooseSpace(space: Space, shown: Space): void {
  if (space === shown) return
  setSpace(space)
  if (space === 'notes') navigate({ view: 'notes' })
  else void openStartView()
}

export function SpaceSwitch({ space, collapsed }: { space: Space; collapsed: boolean }) {
  const options = [{ id: 'tasks' as const, label: t('Tasks') }, { id: 'notes' as const, label: t('Notes') }]
  if (collapsed) {
    return (
      <div role="group" aria-label={t('Space')} className="mb-2 flex flex-col items-center gap-0.5" data-space-switch>
        {options.map((o) => (
          <Tooltip key={o.id} label={o.label} side="right">
            <button type="button" aria-label={o.label} aria-pressed={space === o.id} data-segment={o.id} onClick={() => chooseSpace(o.id, space)}
              className={`flex min-h-8 w-full items-center justify-center rounded-control ${space === o.id ? 'bg-selected text-strong' : 'text-faint hover:bg-hover hover:text-default'}`}>
              <Icon name={o.id === 'tasks' ? 'list-checks' : 'notebook-pen'} />
            </button>
          </Tooltip>
        ))}
      </div>
    )
  }
  return <SegmentedControl options={options} value={space} onChange={(s) => chooseSpace(s, space)} label={t('Space')} fill className="mb-2" data-space-switch />
}
