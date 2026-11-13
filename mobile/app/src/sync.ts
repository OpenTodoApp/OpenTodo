// Sync in the app (OpenSpec native-app "Sync in the app", design D6): the shared engine,
// unchanged, on the app's network (requests by path go to the account's server with its
// token, the live stream is src/net/eventSource.ts).
//
// The engine already pulls and reopens the stream when the app comes to the front (the
// platform port's visibility). Going to the background, the app lets the outbox drain and
// then drops the stream; iOS suspends the app soon after.
import { platform } from '@shared/platform'
import { startSync, stopSyncAndWait, syncNow } from '@shared/sync'
import type { Session } from './auth/tokens'
import { dropStreams, eventSourceClass } from './net/eventSource'
import { installServerFetch, serverSession, setServerSession } from './net/serverFetch'

/** At start-up, before any shared module asks the server. */
export function installNetwork(): void {
  installServerFetch()
  const visible = () => platform.visibility.visible()
  ;(globalThis as { EventSource?: unknown }).EventSource = eventSourceClass({ session: serverSession, visible })
}

let offVisibility: (() => void) | null = null

export function startAccountSync(session: Session): void {
  setServerSession(session)
  offVisibility ??= platform.visibility.onChange((visible) => {
    if (visible) return
    void syncNow().catch(() => undefined).finally(() => {
      if (!platform.visibility.visible()) dropStreams()
    })
  })
  startSync()
}

/** Sign-out, or a grant that ended: the running exchange stops before the data goes. */
export async function stopAccountSync(): Promise<void> {
  offVisibility?.()
  offVisibility = null
  await stopSyncAndWait()
  dropStreams()
  setServerSession(null)
}
