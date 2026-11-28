// What draws a task row in place of the app's own (OpenSpec change phone-all-screens,
// design D3): the phone UI gives its row, fed by the same props, so every screen that
// lists tasks with TaskRow shows the phone row while the phone screens are on. A board's
// card and the compact shape are not rows and are never handed over.
import { createContext, type ReactNode } from 'react'
import type { Project, Task } from '../../lib/types'
import type { TaskRowProps } from '../TaskRow'

export const TaskRowDrawContext = createContext<((props: TaskRowProps) => ReactNode) | null>(null)

export type { TaskRowProps }

/**
 * What heads the actions sheet of one task (OpenSpec change phone-delight, design D4): the phone
 * UI draws the task's facts as its row shows them; without it the sheet is headed by its count.
 */
export const RowPreviewContext = createContext<((task: Task) => ReactNode) | null>(null)

/**
 * A task in one of the calendar's lists (Week's days, Month's chosen day, Plan's agenda;
 * OpenSpec change phone-calendar, design D1): what the list says of the task on that day.
 * The lists keep their own rows; the phone UI gives one drawing for the three.
 */
export interface CalendarRowProps {
  task: Task
  /** The day the row is listed under. */
  date: string
  today: string
  /** The row's time as the list writes it, or nothing for a task without one. */
  time?: string | null
  /** A span's place or range on this day ("Day 2 of 3"). */
  note?: string
  readOnly?: boolean
  project?: Project
}

export const CalendarRowDrawContext = createContext<((props: CalendarRowProps) => ReactNode) | null>(null)
