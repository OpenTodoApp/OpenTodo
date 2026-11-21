// The card of a screen behind an emailed link (/invite/<token>, /reset/<token>), and
// what it shows while the link is checked or cannot be used.
import type { ReactNode } from 'react'
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

/** The card for every state but `ready`; the texts name what the link is for. */
export function LinkStateCard({ state, checking, offline, invalidTitle, invalid, onRetry }: {
  state: Exclude<LinkState<unknown>, { kind: 'ready' }>
  checking: string
  offline: string
  invalidTitle: string
  invalid: string
  onRetry: () => void
}) {
  switch (state.kind) {
    case 'loading':
      return <LinkCard title={checking}><p className="text-body text-muted">{t('One moment.')}</p></LinkCard>
    case 'offline':
      return (
        <LinkCard title={t('You seem to be offline')}>
          <p className="text-body text-muted">{offline}</p>
          <button className="ui-btn ui-btn--primary ui-btn--md" onClick={onRetry}>{t('Retry now')}</button>
        </LinkCard>
      )
    case 'invalid':
      return (
        <LinkCard title={invalidTitle}>
          <p className="text-body text-muted">{invalid}</p>
          <a className="ui-btn ui-btn--secondary ui-btn--md" href="/">{t('Go to sign-in')}</a>
        </LinkCard>
      )
    case 'rate-limited':
      return (
        <LinkCard title={t('Too many attempts')}>
          <p className="text-body text-muted">{t('Wait a minute, then try again.')}</p>
          <button className="ui-btn ui-btn--primary ui-btn--md" onClick={onRetry}>{t('Retry')}</button>
        </LinkCard>
      )
    case 'error':
      return (
        <LinkCard title={t('Something went wrong')}>
          <p className="text-body text-danger">{state.message}</p>
          <button className="ui-btn ui-btn--primary ui-btn--md" onClick={onRetry}>{t('Retry')}</button>
        </LinkCard>
      )
  }
}
