import type { ReactNode } from 'react'
import { openHelp } from './store'

/**
 * A small "Help" button that opens the guide section for `screen` in a side panel
 * (a sheet on phones) over the current screen, which stays as it is. The screen
 * ids are listed in the `screens` front matter of the pages in docs/; the docs
 * check fails when a link names one no page has.
 */
export function HelpLink({ screen, topic, className = '' }: { screen: string; topic?: string; className?: string }) {
  return (
    <button type="button" data-help-screen={screen}
      className={`btn-ghost touch-target shrink-0 px-1.5 py-0.5 text-xs font-normal text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 ${className}`}
      aria-label={topic ? `Help: ${topic}` : 'Help'} aria-haspopup="dialog"
      onClick={(e) => openHelp(screen, e.currentTarget)}>
      <span aria-hidden="true" className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px] leading-none">?</span>Help
    </button>
  )
}

/** A settings section heading with its Help link on the right. */
export function HelpHeading({ screen, children, id, level = 2, className = 'font-semibold' }: { screen: string; children: ReactNode; id?: string; level?: 2 | 3; className?: string }) {
  const H = level === 2 ? 'h2' : 'h3'
  const topic = typeof children === 'string' ? children : undefined
  return (
    <div className="flex items-center justify-between gap-2">
      <H id={id} className={className}>{children}</H>
      <HelpLink screen={screen} topic={topic} />
    </div>
  )
}
