// The Inbox's detail pane with no task under the cursor (OpenSpec change inbox-split,
// design D2): where the docked task will stand, and the two ways on from here.
import { t } from '../lib/i18n'
import { Icon } from '../ui'

export function InboxEmptyPane({ count }: { count: number }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center" data-inbox-empty-pane>
      <Icon name="inbox" size={40} className="mb-2 text-faint" />
      <h2 className="text-body font-medium text-default">{t('No task selected')}</h2>
      <p className="max-w-xs text-meta text-muted">
        {t.rich('Select a task to decide where it goes, or press {key} to process {count, plural, one {it} other {all #, one at a time}}.', {
          key: <kbd className="ui-kbd">P</kbd>,
          count,
        })}
      </p>
    </div>
  )
}
