// The page behind a routine email's stop link (OpenSpec change
// routines-shared-email): the routine's name and Stop emails. Signed out too,
// no sync and nothing stored; only the button stops, so a mail scanner opening
// the link changes nothing.
import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Notice } from '../ui'
import { t } from '../lib/i18n'
import { InstanceMark, InstanceWordmark } from './InstanceBrand'

export type StopState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'rate-limited' }
  | { kind: 'unreachable' }
  | { kind: 'ready'; routine: string; stopped: boolean }

/** Reads the link, or stops the routine's emails; never with the session's cookie. */
async function call(token: string, stop: boolean): Promise<StopState> {
  let res: Response
  try {
    res = await fetch(`/api/v1/routine-emails/${encodeURIComponent(token)}${stop ? '/stop' : ''}`, { method: stop ? 'POST' : 'GET', credentials: 'omit', cache: 'no-store' })
  } catch {
    return { kind: 'unreachable' }
  }
  if (res.status === 429) return { kind: 'rate-limited' }
  const body = res.ok ? ((await res.json().catch(() => null)) as { routine?: unknown; stopped?: unknown } | null) : null
  return body && typeof body.routine === 'string' ? { kind: 'ready', routine: body.routine, stopped: body.stopped === true } : { kind: 'invalid' }
}

export function RoutineEmailStopScreen({ token }: { token: string }) {
  const [state, setState] = useState<StopState>({ kind: 'loading' })

  const load = useCallback(async () => setState(await call(token, false)), [token])

  useEffect(() => {
    void load()
    const retry = () => void load()
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [load])

  const stop = async () => setState(await call(token, true))

  return <RoutineEmailStopView state={state} onStop={stop} />
}

/** Every state of the stop page, for tests and stories. */
export function RoutineEmailStopView({ state, onStop }: { state: StopState; onStop: () => unknown }) {
  return (
    <main className="flex min-h-full items-center justify-center bg-canvas p-4" data-screen="routine-email-stop">
      <Card className="w-full max-w-sm space-y-3">
        <div className="flex items-center gap-3">
          <InstanceMark size={32} />
          <span className="text-h3 font-semibold"><InstanceWordmark /></span>
        </div>
        {state.kind === 'loading' && <p className="text-body text-muted">{t('One moment.')}</p>}
        {state.kind === 'invalid' && <h1 className="text-body font-medium" data-stop-invalid>{t('This link is no longer valid.')}</h1>}
        {state.kind === 'rate-limited' && <Notice tone="warning">{t('Too many requests from this network. Wait a minute, then reload the page.')}</Notice>}
        {state.kind === 'unreachable' && <Notice tone="warning">{t('Not available offline.')}</Notice>}
        {state.kind === 'ready' && (state.stopped
          ? <h1 className="text-body font-medium" data-stop-done>{t('You will get no more emails from “{routine}”.', { routine: state.routine })}</h1>
          : (
            <>
              <h1 className="text-body font-medium">{t('Stop emails from “{routine}”?', { routine: state.routine })}</h1>
              <Button variant="primary" onClick={onStop} data-stop-button>{t('Stop emails')}</Button>
            </>
          ))}
      </Card>
    </main>
  )
}
