// Actions on the messages of a conversation (OpenSpec change assistant-generative-ui
// D8): Copy on every finished answer, Regenerate on the latest answer and Edit on the
// latest question. Regenerate and Edit follow sending's rules, so they wait while an
// answer streams and offline.
import { useEffect, useState } from 'react'
import { copyText } from '../../lib/clipboard'
import { t } from '../../lib/i18n'
import { IconButton } from '../../ui'

export interface AnswerActionsProps {
  /** The answer as Markdown, blocks written as plain text. */
  text: () => string | Promise<string>
  onRegenerate?: () => void
  enabled: boolean
}

export function AnswerActions({ text, onRegenerate, enabled }: AnswerActionsProps) {
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null)
  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(null), 2000)
    return () => clearTimeout(id)
  }, [copied])
  const copy = async () => {
    try {
      await copyText(await text())
      setCopied('ok')
    } catch {
      setCopied('failed')
    }
  }
  return (
    <div className="-ml-1.5 flex items-center gap-0.5" data-assistant-actions>
      <IconButton icon={copied === 'ok' ? 'check' : 'copy'} size="sm" className="touch-target text-muted" onClick={() => void copy()}
        label={copied === 'ok' ? t('Copied') : copied === 'failed' ? t('Could not copy') : t('Copy answer')} data-assistant-copy />
      {onRegenerate && (
        <IconButton icon="rotate-ccw" size="sm" className="touch-target text-muted" label={t('Regenerate')} disabled={!enabled} onClick={onRegenerate} data-assistant-regenerate />
      )}
      <span className="sr-only" aria-live="polite">{copied === 'ok' ? t('Copied') : copied === 'failed' ? t('Could not copy') : ''}</span>
    </div>
  )
}

/** Edit on the latest question: its text goes back to the composer. */
export function QuestionActions({ onEdit, enabled }: { onEdit: () => void; enabled: boolean }) {
  return (
    <div className="flex justify-end" data-assistant-question-actions>
      <IconButton icon="pencil" size="sm" className="touch-target text-muted" label={t('Edit question')} disabled={!enabled} onClick={onEdit} data-assistant-edit />
    </div>
  )
}
