// The app icon badge (OpenSpec changes `app-icon-badge`, `badge-overdue`): the signed-in
// app keeps it current. The per-device choice in Settings is AppBadge.tsx.
import { useAppBadge } from '../lib/appBadge'
import { useMe } from '../lib/sharing'
import { useLiveTasks, useOpenTasks } from '../lib/liveTasks'
import { useSettledValue } from '../lib/useSettledValue'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { useToday, useViewerZone } from './useViews'

/** Sets the badge from the live open tasks; rendered once beside the signed-in Shell. */
export function AppBadgeSync(): null {
  const live = useLiveTasks()
  // Counted once the writes stop (list-rendering-at-scale D6): the badge need not follow each tick.
  const open = useSettledValue(useOpenTasks())
  const today = useToday()
  const zone = useViewerZone()
  const { dayStart } = useDateTimeFormat()
  const me = useMe()
  useAppBadge(open, live !== undefined, today, dayStart, zone, me)
  return null
}
