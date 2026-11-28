import { mutate } from './ops'
import type { UserPrefs } from './types'
import { USER_PREFS_ID } from './userPrefs'

export const PRIORITY_CIRCLE_STYLES = ['filled', 'outline'] as const
export type PriorityCircleStyle = (typeof PRIORITY_CIRCLE_STYLES)[number]

export function readPriorityCircleStyle(row: Pick<UserPrefs, 'priority_circle_style'> | null | undefined): PriorityCircleStyle {
  return row?.priority_circle_style === 'outline' ? 'outline' : 'filled'
}

export function setPriorityCircleStyle(style: PriorityCircleStyle): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { priority_circle_style: style })
}
