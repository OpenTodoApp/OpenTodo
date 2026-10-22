// Where "Remove sample tasks" is offered (OpenSpec change moments-and-onboarding,
// design D4): the task panel's one-line notice on a sample ("A sample task · Remove
// sample tasks") and the Inbox header's menu while any sample task exists.
import type { ReactNode } from 'react'
import { Icon, Menu, MenuItem, MenuSeparator } from '../ui'
import { useHasSampleTasks } from '../lib/sampleTasks'
import { t } from '../lib/i18n'
import { removeSamplesWithUndo } from './sampleActions'

export function SampleNotice() {
  return (
    <p role="note" className="border-b border-default bg-sunken px-4 py-2 text-meta text-muted" data-sample-notice>
      {t('A sample task')}
      <span aria-hidden="true"> · </span>
      <button type="button" className="text-accent underline-offset-2 hover:underline" data-remove-samples onClick={removeSamplesWithUndo}>
        {t('Remove sample tasks')}
      </button>
    </p>
  )
}

/** The Inbox header's menu, present while a sample task exists or a phone adds its list items (phone-v2 D1). */
export function InboxMenu({ extra }: { extra?: ReactNode }) {
  const samples = useHasSampleTasks()
  if (!samples && !extra) return null
  return (
    <Menu kind="menu" label={t('Inbox menu')} title={t('Inbox')} trigger={<Icon name="ellipsis" size="md" />}
      triggerClassName="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 py-1.5" triggerProps={{ 'data-inbox-menu': true }}>
      {extra}
      {extra && samples && <MenuSeparator />}
      {samples && <MenuItem icon="trash-2" label={t('Remove sample tasks')} data-remove-samples onSelect={removeSamplesWithUndo} />}
    </Menu>
  )
}
