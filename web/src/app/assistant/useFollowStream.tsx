// Following the stream (OpenSpec change assistant-generative-ui D8): the transcript
// keeps its newest line in view while an answer grows, lets go when the person
// scrolls up, and offers "Jump to latest". It uses the scroll region the transcript
// already has (the sheet's body, the page's content column) and adds none.
import { useCallback, useEffect } from 'react'
import { useStickToBottom } from 'use-stick-to-bottom'
import { t } from '../../lib/i18n'
import { Icon, useMediaQuery } from '../../ui'

/** The region the transcript lives in: the sheet's body, or the shell's content column on the page. */
function scrollerOf(el: HTMLElement | null): HTMLElement | null {
  return el?.parentElement?.closest<HTMLElement>('[data-assistant-scroll], #content') ?? null
}

export interface FollowStream {
  /** On the element whose height grows with the conversation. */
  contentRef: (el: HTMLElement | null) => void
  /** Whether "Jump to latest" is due: the person scrolled away from the end. */
  away: boolean
  jump: () => void
}

/** `active`: a conversation is shown (the empty state never follows). */
export function useFollowStream(active: boolean): FollowStream {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const stick = useStickToBottom({ initial: 'instant', resize: reduced ? 'instant' : 'smooth' })
  const { scrollRef, contentRef: stickContent } = stick
  const contentRef = useCallback((el: HTMLElement | null) => {
    stickContent(el)
    scrollRef(scrollerOf(el))
  }, [scrollRef, stickContent])
  // A new thread (or the first message) starts at its end.
  useEffect(() => { if (active) void stick.scrollToBottom('instant') }, [active]) // eslint-disable-line react-hooks/exhaustive-deps
  return { contentRef, away: active && !stick.isAtBottom, jump: () => void stick.scrollToBottom(reduced ? 'instant' : 'smooth') }
}

/** "Jump to latest", shown above the composer while the person reads back. */
export function JumpToLatest({ follow }: { follow: FollowStream }) {
  if (!follow.away) return null
  return (
    <div className="flex justify-center" data-assistant-jump>
      <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm touch-target gap-1 shadow-1" onClick={follow.jump}>
        <Icon name="arrow-down" size="sm" />{t('Jump to latest')}
      </button>
    </div>
  )
}
