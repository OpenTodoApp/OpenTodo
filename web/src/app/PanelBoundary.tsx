import { Component, type ErrorInfo, type ReactNode } from 'react'
import { t } from '../lib/i18n'
import { isChunkLoadError, retryFailedImports } from '../lib/lazy'

interface Props {
  children: ReactNode
  /** A new value (the route, the open task) clears a shown error and renders the children again. */
  resetKey?: unknown
}
interface State { error: Error | null }

/** Tries after the connection returns before the message stays (1, 2 and 4 s apart). */
const RETRIES = 4

/**
 * Error boundary around one part of the shell (OpenSpec change
 * client-sync-robustness): a screen or panel that fails to render, or whose
 * code chunk is gone after a server upgrade, shows this message with a Reload
 * button while the sidebar and the rest of the shell keep working. A code chunk
 * that could not be fetched while offline renders again once the device is back
 * online (OpenSpec change lazy-retry-online).
 */
export class PanelBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('OpenTodo: a part of the app failed to render', error, info.componentStack)
    if (!isChunkLoadError(error)) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.attempts = 0
      window.removeEventListener('online', this.retry)
      window.addEventListener('online', this.retry, { once: true })
    } else if (this.attempts > 0 && this.attempts < RETRIES) {
      // The connection is back but the first requests can still fail: try again a moment later.
      this.timer = setTimeout(this.retry, 1000 * 2 ** (this.attempts - 1))
    }
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  componentWillUnmount(): void {
    window.removeEventListener('online', this.retry)
    clearTimeout(this.timer)
  }

  /** How many times the part was tried again since it failed offline. */
  private attempts = 0
  private timer: ReturnType<typeof setTimeout> | undefined

  /** Back online: the failed imports get a fresh try and the part renders again. */
  private retry = (): void => {
    this.attempts++
    retryFailedImports()
    this.setState({ error: null })
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
