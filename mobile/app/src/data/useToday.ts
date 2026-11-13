// The day the lists show, read again when the app comes to the front (past midnight).
import { useEffect, useState } from 'react'
import { logicalToday } from '@shared/dates'
import { platform } from '@shared/platform'

export function useToday(): string {
  const [today, setToday] = useState(() => logicalToday())
  useEffect(() => platform.visibility.onChange((visible) => { if (visible) setToday(logicalToday()) }), [])
  return today
}
