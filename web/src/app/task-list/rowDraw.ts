// What draws a task row in place of the app's own (OpenSpec change phone-all-screens,
// design D3): the phone UI gives its row, fed by the same props, so every screen that
// lists tasks with TaskRow shows the phone row while the phone screens are on. A board's
// card and the compact shape are not rows and are never handed over.
import { createContext, type ReactNode } from 'react'
import type { TaskRowProps } from '../TaskRow'

export const TaskRowDrawContext = createContext<((props: TaskRowProps) => ReactNode) | null>(null)

export type { TaskRowProps }
