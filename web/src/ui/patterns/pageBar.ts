// What the current page's header declares (OpenSpec change ux-overhaul, app-shell
// "No desktop top bar", design D3): below 768 px the shell's bar shows the title and
// the actions a view declared once in its PageHeader, so no view renders two headers.
import type { ReactNode } from 'react'
import { createStore } from '../../lib/store'

export interface PageBar {
  title: ReactNode
  /** A line under the title on phones (the board's current column). */
  subtitle?: ReactNode
  actions?: ReactNode
  overflow?: ReactNode
  /** A complete menu element in place of the default overflow (the project menu). */
  menu?: ReactNode
  help?: string
  back?: { label: string; href?: string; onClick: () => void }
  /** A day page (Today, Upcoming): the page shows its own title, date and briefing, so the bar carries none (precision-phone D1). */
  day?: boolean
}

const store = createStore<PageBar | null>('pageBar', null)

export const setPageBar = store.set
export const pageBar = store.get
export const usePageBar = store.use
