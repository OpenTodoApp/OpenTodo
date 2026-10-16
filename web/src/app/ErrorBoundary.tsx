import { Component, type ReactNode } from 'react'
import { t } from '../lib/i18n'

interface State { error: Error | null }

/** Last line of defence: a render bug shows a recoverable message instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-medium">{t('Something went wrong in the app.')}</p>
        <pre className="max-w-lg overflow-auto rounded-control bg-sunken p-3 text-left text-meta text-danger">{this.state.error.message}</pre>
        <p className="text-body text-muted">{t('Your data is safe on this device and on the server.')}</p>
        <button className="ui-btn ui-btn--primary ui-btn--md" onClick={() => location.reload()}>{t('Reload')}</button>
      </div>
    )
  }
}
