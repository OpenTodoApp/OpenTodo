// Follow-up suggestions (OpenSpec change assistant-followups, design D1): quiet
// one-tap chips under the latest answer, after its actions row. Activating one
// sends its text as the next message, the same way as typing it. Offline or while
// an answer streams they stay in place, disabled.
import { t } from '../../../lib/i18n'

export function FollowupChips({ suggestions, enabled, onFollowUp }: { suggestions: string[]; enabled: boolean; onFollowUp: (text: string) => void }) {
  if (!suggestions.length) return null
  return (
    <div role="group" aria-label={t('Suggested next steps')} className="flex flex-wrap gap-1.5 pt-1" data-assistant-followups>
      {suggestions.map((s) => (
        <button key={s} type="button" disabled={!enabled} onClick={() => onFollowUp(s)} data-followup
          className="touch-target max-w-full truncate rounded-full border border-default bg-surface px-3 py-1 text-meta text-default transition-colors duration-(--duration-ui) ease-calm user-text hover:bg-hover active:bg-selected focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface">
          {s}
        </button>
      ))}
    </div>
  )
}
