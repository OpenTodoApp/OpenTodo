// Entry points to the assistant (OpenSpec change assistant-skills, design D4;
// assistant-surface D1): an Ask action in Today's header that opens the side sheet,
// and the Assistant page at `/ask`, which holds the conversation itself. When the
// assistant is not available they show nothing, or why. Part of the main chunk; the
// sheet and the page's conversation stay in the lazy assistant chunk.
import { lazy, Suspense } from 'react'
import { openAssistant, openAssistantWith, useAssistantStatus, type AssistantStatus } from '../../lib/assistantStatus'
import type { AccountRole } from '../../lib/types'
import { Button, PageBody, PageHeader, Tooltip } from '../../ui'
import { keysOf } from '../../lib/shortcuts'
import type { AskRequest } from '../../ui'
import { Notice } from '../../ui'
import { requestSettingsFocus } from '../settingsIndex'
import { navigate } from '../router'
import { EncryptionOffHint } from './AssistantPanelBody'
import { t, msg } from '../../lib/i18n'

export type AskMode = 'composer' | 'owner-hint' | 'encrypted' | 'none'

/** What the entry points show for this status and role. */
export function askMode(s: AssistantStatus | null, role: AccountRole | undefined): AskMode {
  if (!s || s.reason === 'demo') return 'none'
  if (s.available) return 'composer'
  if (s.reason === 'encryption_enabled') return 'encrypted'
  return role === 'owner' ? 'owner-hint' : 'none'
}

export function ask(r: AskRequest): void {
  openAssistantWith({ text: r.text, ...(r.skill ? { skill: r.skill } : {}), ...(r.pasted ? { pasted: r.pasted } : {}), send: r.send })
}

/**
 * Today's page action (ux-overhaul, in-app-assistant "Ask composer"): one "Ask"
 * button in the header when the assistant is available, nothing otherwise. The
 * composer and the starter skills live on the Assistant page.
 */
/** Whether Today offers Ask (the composer is available to this account). */
export function useTodayAsk(role?: AccountRole): boolean {
  return askMode(useAssistantStatus(), role) === 'composer'
}

export function TodayAskAction({ role }: { role?: AccountRole }) {
  const status = useAssistantStatus()
  if (askMode(status, role) !== 'composer') return null
  return (
    // The tooltip names the action and its key (design-system "Tooltip primitive"; no native title, ux-audit-three-widths F1).
    <Tooltip label={t('Ask the assistant')} shortcut={keysOf('global.assistant')}>
      <Button variant="ghost" size="sm" icon="message-circle" onClick={() => openAssistant()} aria-haspopup="dialog" data-today-ask>
        {t('Ask')}
      </Button>
    </Tooltip>
  )
}

const ENCRYPTED = msg('The assistant can’t read end-to-end encrypted tasks. Your tasks never leave your devices unencrypted.')

// The conversation on the page is in the assistant's own chunk, like the sheet.
const AssistantPage = lazy(() => import('./AssistantPage'))

/** The Assistant page (`/ask`, `g` then `k`): the conversation itself, or why the assistant is not available. */
export function AskScreen({ role, name = '' }: { role?: AccountRole; name?: string }) {
  const status = useAssistantStatus()
  const mode = askMode(status, role)
  if (mode === 'composer') {
    return (
      <Suspense fallback={<PageBody width="list" data-ask-screen><PageHeader title={t('Assistant')} help="ask" /></PageBody>}>
        <AssistantPage name={name} />
      </Suspense>
    )
  }
  return (
    <PageBody width="list" data-ask-screen>
      <PageHeader title={t('Assistant')} help="ask" />
      {mode === 'encrypted' && <Notice tone="info"><span data-ask-unavailable>{t(ENCRYPTED)}</span> <EncryptionOffHint /></Notice>}
      {(mode === 'owner-hint' || mode === 'none') && (
        <Notice tone="info">
          <span data-ask-unavailable>
            {status?.reason === 'demo' ? t('The assistant is not available on the demo instance.') : t('The assistant is not turned on on this server.')}
            {mode === 'owner-hint' && (
              <> <a className="underline" href="/settings/integrations" onClick={(e) => { e.preventDefault(); requestSettingsFocus('ai'); navigate({ view: 'settings', section: 'integrations' }) }}>{t('Set it up in the assistant settings.')}</a></>
            )}
          </span>
        </Notice>
      )}
    </PageBody>
  )
}
