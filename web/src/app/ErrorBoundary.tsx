import { Component, type ReactNode } from 'react'

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
        <p className="font-medium">Something went wrong in the app.</p>
        <pre className="max-w-lg overflow-auto rounded bg-slate-100 p-3 text-left text-xs text-red-700 dark:bg-slate-900 dark:text-red-300">{this.state.error.message}</pre>
        <p className="text-sm text-muted">Your data is safe on this device and on the server.</p>
        <button className="btn-primary" onClick={() => location.reload()}>Reload</button>
      </div>
    )
  }
}
