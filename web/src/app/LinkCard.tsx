// The card of a screen behind an emailed link (/invite/<token>, /reset/<token>, a
// project's or a workspace's invite link), and what it shows while the link is
// checked or cannot be used.
import type { ComponentType, ReactNode } from 'react'
import { t } from '../lib/i18n'
import { InstanceMark, InstanceWordmark } from './InstanceBrand'

/** A link screen's state: its preview once the server accepted the token. */
export type LinkState<P> =
  | { kind: 'loading' }
  | { kind: 'offline' }
  | { kind: 'invalid' }
  | { kind: 'rate-limited' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; preview: P }

export function LinkCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm space-y-3 rounded-card border border-default bg-surface p-6 shadow-1">
        <div className="flex items-center gap-3">
          <InstanceMark size={32} />
          <h1 className="text-h3 font-semibold"><InstanceWordmark /></h1>
        </div>
        <h2 className="font-medium">{title}</h2>
        {children}
      </div>
    </div>
  )
}

/** The card of a project's or a workspace's invite link: the page's main landmark, its title the h1. */
export function InviteCard({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-canvas p-4 sm:p-6">
      <main className="w-full max-w-sm space-y-3 rounded-card border border-default bg-surface p-5 shadow-1 sm:p-6">
        <div className="flex items-center gap-3">
          <InstanceMark size={32} />
          <p className="text-h3 font-semibold"><InstanceWordmark /></p>
        </div>
        <h1 className="font-medium">{title}</h1>
        {children}
      </main>
    </div>
  )
}

/**
 * The card for every state but `ready`; the texts name what the link is for. `frame` is
 * the card it is drawn in, `back` the label of the invalid link's way out.
 */
export function LinkStateCard({ state, checking, offline, invalidTitle, invalid, onRetry, frame: Card = LinkCard, back = t('Go to sign-in') }: {
  state: Exclude<LinkState<unknown>, { kind: 'ready' }>
  checking: string
  offline: string
  invalidTitle: string
  invalid: string
  onRetry: () => void
  frame?: ComponentType<{ title: string; children: ReactNode }>
  back?: string
}) {
  switch (state.kind) {
    case 'loading':
      return <Card title={checking}><p className="text-body text-muted">{t('One moment.')}</p></Card>
    case 'offline':
      return (
        <Card title={t('You seem to be offline')}>
          <p className="text-body text-muted">{offline}</p>
          <button className="ui-btn ui-btn--primary ui-btn--md" onClick={onRetry}>{t('Retry now')}</button>
        </Card>
      )
    case 'invalid':
      return (
        <Card title={invalidTitle}>
          <p className="text-body text-muted">{invalid}</p>
          <a className="ui-btn ui-btn--secondary ui-btn--md" href="/">{back}</a>
        </Card>
      )
    case 'rate-limited':
      return (
        <Card title={t('Too many attempts')}>
          <p className="text-body text-muted">{t('Wait a minute, then try again.')}</p>
          <button className="ui-btn ui-btn--primary ui-btn--md" onClick={onRetry}>{t('Retry')}</button>
        </Card>
      )
    case 'error':
      return (
        <Card title={t('Something went wrong')}>
          <p className="text-body text-danger">{state.message}</p>
          <button className="ui-btn ui-btn--primary ui-btn--md" onClick={onRetry}>{t('Retry')}</button>
        </Card>
      )
  }
}
