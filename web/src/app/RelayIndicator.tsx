// The sidebar footer's mark while this device answers an AI connector or runs a routine.
import { useSyncExternalStore } from 'react'
import { Icon, Tooltip } from '../ui'
import { t } from '../lib/i18n'
import { onRelayChange, relaySnapshot } from '../lib/relay'

/**
 * The footer mark while this device answers an AI connector (design D10: no
 * new row), or runs one of the account's routines (routines-ai-step D7).
 */
export function RelayIndicatorView({ busy, running = null, answering = null }: { busy: boolean; running?: string | null; answering?: { tool: string; token?: string } | null }) {
  if (!busy && running === null) return null
  // The call being answered, as the server named it (relay-request-transparency D3).
  const answeringLabel = answering
    ? (answering.token ? t('Answering {token}: {tool}', { token: answering.token, tool: answering.tool }) : t('Answering an AI connector: {tool}', { tool: answering.tool }))
    : t('Answering an AI connector')
  const label = running !== null ? t('Running {name}…', { name: running || t('Untitled routine') }) : answeringLabel
  return (
    <Tooltip label={label} side="top">
      <span role="status" tabIndex={0} className="inline-flex size-8 items-center justify-center rounded-control text-accent" data-relay-indicator>
        <Icon name={running !== null ? 'zap' : 'key-round'} size="sm" />
        <span className="sr-only">{label}</span>
      </span>
    </Tooltip>
  )
}

export function RelayIndicator() {
  const { busy, running, answering } = useSyncExternalStore(onRelayChange, relaySnapshot, relaySnapshot)
  return <RelayIndicatorView busy={busy} running={running?.name ?? null} answering={answering} />
}
