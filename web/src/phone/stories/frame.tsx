// The frame of every phone story (OpenSpec change phone-ui-trial, design D7): a
// phone-sized box, whatever the workbench's Width says, so the accessibility and
// visual checks see a phone. It is a containing block, so what a screen pins
// (its bar, a sheet) stays inside it, as it must inside a pane (design D9).
import type { Decorator } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { Icon, type IconName } from '../../ui'

export const PHONE_W = 375
export const PHONE_H = 760

export function PhoneFrame({ children, width = PHONE_W, height = PHONE_H }: { children: ReactNode; width?: number; height?: number }) {
  return (
    <div data-phone-frame className="relative isolate max-w-full overflow-hidden rounded-[2rem] border border-default bg-canvas shadow-2"
      style={{ width, height, transform: 'translateZ(0)' }}>
      {children}
    </div>
  )
}

/** What scrolls a screen in a story: the shell's content in the app, a pane on a tablet. */
export function StoryScroller({ children, chrome = false }: { children: ReactNode; chrome?: boolean }) {
  return (
    <div data-story-scroller id="content" className={`h-full overflow-y-auto overscroll-y-contain ${chrome ? 'pb-32' : ''}`}>
      {children}
    </div>
  )
}

export const withPhoneFrame: Decorator = (Story) => <PhoneFrame><Story /></PhoneFrame>

const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: 'inbox', label: 'Inbox', icon: 'inbox' },
  { id: 'today', label: 'Today', icon: 'sun' },
  { id: 'upcoming', label: 'Upcoming', icon: 'calendar-days' },
  { id: 'search', label: 'Search', icon: 'search' },
]

/** The height the tab bar takes, which a screen leaves free at its end. */
export const CHROME_ROOM = '3.5rem'

/** A drawing of the app's tab bar and add button, which the shell owns: stories only. */
export function StoryChrome({ current = 'today' }: { current?: string }) {
  return (
    <>
      <div aria-hidden className="absolute bottom-[4.5rem] inset-e-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-3">
        <Icon name="plus" size="lg" />
      </div>
      <div aria-hidden className="absolute inset-x-0 bottom-0 z-20 flex border-t border-soft bg-canvas">
        {TABS.map((tab) => (
          <span key={tab.id} className={`flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-hint ${tab.id === current ? 'text-strong' : 'text-muted'}`}>
            <Icon name={tab.icon} size="md" />{tab.label}
          </span>
        ))}
      </div>
    </>
  )
}

/** A drawing of a bottom sheet over a screen: the scrim, the handle, the title. Stories only. */
export function StorySheet({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-scrim">
      <div role="dialog" aria-label={title} className="max-h-[92%] overflow-y-auto rounded-t-[1.25rem] bg-surface shadow-3">
        <div aria-hidden className="mx-auto mt-2 h-1 w-9 rounded-full bg-sunken" />
        <div className="flex min-h-11 items-center px-5 pb-1 pt-1">
          <p className="flex-1 text-title text-strong">{title}</p>
          {action}
        </div>
        {children}
      </div>
    </div>
  )
}
