// Quick add's dictation controls (voice-capture), kept out of the QuickAdd body: the
// microphone button at the end of the line, and the status and message under it.
import { keysOf } from '../../lib/shortcuts'
import { t } from '../../lib/i18n'
import { Icon, Tooltip } from '../../ui'
import type { useDictation } from '../useDictation'

type Voice = ReturnType<typeof useDictation>

/** The microphone button; it never takes focus, since the transcript goes where the caret is. */
export function VoiceButton({ voice, shortcut }: { voice: Voice; shortcut?: boolean }) {
  return (
    <Tooltip label={voice.listening ? t('Stop dictation') : t('Dictate a task')} shortcut={voice.listening ? 'Esc' : shortcut ? keysOf('list.dictate') : undefined}>
      <button
        type="button"
        className={`relative shrink-0 rounded-full p-1.5 ${voice.listening ? 'bg-danger-soft text-danger' : 'text-faint hover:bg-sunken hover:text-muted dark:hover:bg-raised'}`}
        aria-pressed={voice.listening}
        aria-label={voice.listening ? t('Stop dictation') : t('Dictate a task')}
        data-voice-button
        onMouseDown={(e) => e.preventDefault()}
        onClick={voice.toggle}
      >
        {voice.listening && <span className="absolute inset-0 animate-ping rounded-full bg-danger/40 motion-reduce:hidden" aria-hidden="true" />}
        <Icon name="mic" className="relative" />
      </button>
    </Tooltip>
  )
}

/** The spoken status and, when recognition needs the user, its message with Dismiss. */
export function VoiceNotice({ voice }: { voice: Voice }) {
  return (
    <>
      <span className="sr-only" role="status" aria-live="polite" data-voice-status>{voice.view.announcement}</span>
      {voice.view.message && (
        <p className="mt-1 flex items-start gap-2 pl-6 text-meta text-on-warning-soft" data-voice-message>
          <span className="flex-1">{voice.view.message}</span>
          <button type="button" className="underline" onClick={voice.dismissMessage}>{t('Dismiss')}</button>
        </p>
      )}
    </>
  )
}
