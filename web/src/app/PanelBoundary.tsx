import { Component, type ErrorInfo, type ReactNode } from 'react'
import { t } from '../lib/i18n'

interface Props {
  children: ReactNode
  /** A new value (the route, the open task) clears a shown error and renders the children again. */
  resetKey?: unknown
}
interface State { error: Error | null }

/**
 * Error boundary around one part of the shell (OpenSpec change
 * client-sync-robustness): a screen or panel that fails to render, or whose
 * code chunk is gone after a server upgrade, shows this message with a Reload
 * button while the sidebar and the rest of the shell keep working.
 */
export class PanelBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('OpenTodo: a part of the app failed to render', error, info.componentStack)
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" data-panel-error className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-medium">{t('This part of the app could not be shown.')}</p>
        <p className="text-body text-muted">{t('Your data is safe on this device and on the server.')}</p>
        <button type="button" className="ui-btn ui-btn--primary ui-btn--md" onClick={() => location.reload()}>{t('Reload')}</button>
      </div>
    )
  }
}
