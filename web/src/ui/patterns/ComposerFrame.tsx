// The one composer frame (OpenSpec change task-full-page, design D6): a bordered box
// holding a text field, then a tool row with the caller's tools on the left (mention,
// attach, a skills menu), an optional hint and secondary action, and a round Send
// button on the right. The comment composer uses it on the task page; the assistant's
// composer is meant to adopt it (assistant-surface), so writing to a person and to the
// assistant look and work the same. The frame owns no text and no keys: the field does.
import type { HTMLAttributes, ReactNode } from 'react'
import { Icon } from '../Icon'
import { Tooltip } from '../Tooltip'

export interface ComposerFrameProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** The text field (a textarea or the rich-text editor). */
  children: ReactNode
  /** Above the field: the reply target, pasted material. */
  above?: ReactNode
  /** Under the field: files waiting to go with it. */
  below?: ReactNode
  /** The tool row's left side: icon buttons and menus. */
  tools?: ReactNode
  /** Right of the tools, before Send: the submit keys, a Cancel. */
  end?: ReactNode
  send: {
    /** The accessible name and tooltip ("Comment", "Reply", "Ask"). */
    label: string
    onSend: () => void
    disabled?: boolean
    busy?: boolean
    /** The keys that also send, for the tooltip ("⌘+Enter"). */
    shortcut?: string
  }
}

export function ComposerFrame({ children, above, below, tools, end, send, className, ...rest }: ComposerFrameProps) {
  return (
    <div {...rest} data-composer-frame
      className={`rounded-card border border-input bg-surface focus-within:outline-2 focus-within:outline-offset-0 focus-within:outline-focus${className ? ` ${className}` : ''}`}>
      {above}
      <div className="px-3 pt-2">{children}</div>
      {below && <div className="px-3">{below}</div>}
      <div className="flex min-h-10 items-center gap-1 px-2 pb-2 pt-1" data-composer-tools>
        {tools}
        <span className="min-w-0 flex-1" />
        {end}
        <Tooltip label={send.label} shortcut={send.shortcut}>
          <button type="button" aria-label={send.label} disabled={send.disabled || send.busy} aria-busy={send.busy || undefined} onClick={send.onSend} data-composer-send
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:bg-sunken disabled:text-faint">
            <Icon name={send.busy ? 'loader-circle' : 'arrow-up'} className={send.busy ? 'animate-spin' : undefined} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
