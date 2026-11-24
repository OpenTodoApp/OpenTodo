// A code block with its Copy button (OpenSpec changes copy-code-block and
// editor-copy-code-block). One block for both surfaces: rendered Markdown
// (MarkdownView, for notes, comments, answers and the public pages) and the
// rich-text editor's code_block node view (editorCode), so the two cannot drift.
// The copied text is the block's text as it is shown, so a command pastes into a
// terminal without selecting it by hand.
import { useEffect, useState } from 'react'
import { copyText } from '../lib/clipboard'
import { t } from '../lib/i18n'
import { IconButton } from '../ui'

/** How long the button says it copied before going back to its name. */
const CONFIRM_MS = 2000

type CopyState = 'ok' | 'failed' | null

/**
 * The text a block puts on the clipboard (copy-code-block D2): the block's text
 * without its trailing newlines, so a pasted command runs at once. Indentation is
 * kept: it is part of the code.
 */
function codeText(text: string): string {
  return text.replace(/\n+$/, '')
}

/** The Copy control of a block: copies `text` and says so, resetting after two seconds. */
export function CopyCode({ text }: { text: string }) {
  const [state, setState] = useState<CopyState>(null)
  useEffect(() => {
    if (!state) return
    const id = setTimeout(() => setState(null), CONFIRM_MS)
    return () => clearTimeout(id)
  }, [state])
  const copy = async () => {
    try {
      await copyText(codeText(text))
      setState('ok')
    } catch {
      setState('failed')
    }
  }
  let label = t('Copy code')
  if (state === 'ok') label = t('Copied')
  else if (state === 'failed') label = t('Could not copy')
  return (
    <>
      <IconButton icon={state === 'ok' ? 'check' : 'copy'} size="sm" label={label}
        className="touch-target text-muted" onClick={() => void copy()} data-code-copy="" />
      <span className="sr-only" aria-live="polite">{state ? label : ''}</span>
    </>
  )
}

/**
 * A fenced code block with its Copy button at the top end corner (copy-code-block
 * D1, D3): the button sits in a bar above the code, not over it, so it never
 * covers the first line, and the code keeps its own scroller.
 */
export function CodeBlock({ text, lang }: { text: string; lang?: string }) {
  return (
    <div className="md-code" data-code-block data-lang={lang}>
      <div className="md-code__bar">
        <CopyCode text={text} />
      </div>
      <pre className="overflow-x-auto rounded-control bg-sunken dark:bg-raised p-2 font-mono text-meta" data-scroll-x><code>{text}</code></pre>
    </div>
  )
}
