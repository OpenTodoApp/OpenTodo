// Settings → Capture: bookmarklet and extension (OpenSpec share-capture; settings-redesign D3).
import { useEffect, useRef, useState } from 'react'
import { HelpHeading } from './help/HelpLink'
import { bookmarklet } from '../lib/share'

/**
 * Bookmarklet for this server. The href is set through the DOM because React refuses
 * `javascript:` URLs; clicking it here does nothing (the app's CSP would block it
 * anyway), it is meant to be dragged to the bar.
 */
export function CaptureSection() {
  const code = bookmarklet(location.origin)
  const linkRef = useRef<HTMLAnchorElement>(null)
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null)
  useEffect(() => {
    linkRef.current?.setAttribute('href', code)
  }, [code])

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied('yes')
    } catch {
      setCopied('failed')
    }
  }

  return (
    <section className="space-y-2">
      <HelpHeading screen="settings/capture" className="font-semibold">Capture</HelpHeading>
      <p className="text-sm text-muted">
        Drag this button to your bookmarks bar. On any page, click it to add the page, its title and the selected text to OpenTodo in a small window.
        It holds no password or token; it uses your sign-in on this server. On a phone, install the app and use the share menu instead.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <a
          ref={linkRef}
          draggable
          className="btn-primary cursor-grab"
          title="Drag to your bookmarks bar"
          onClick={(e) => e.preventDefault()}
        >
          Add to OpenTodo
        </a>
        <button className="btn-secondary" onClick={() => void copy()}>Copy bookmarklet</button>
        {copied === 'yes' && <span className="text-xs text-emerald-700 dark:text-emerald-400">Copied. Create a bookmark and paste it as the address.</span>}
      </div>
      {copied === 'failed' && (
        <label className="block text-xs text-muted">
          Copy this code and paste it as a bookmark's address:
          <textarea className="input mt-1 font-mono text-xs" readOnly rows={3} value={code} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
      <p className="text-xs text-faint">A browser extension for Chromium and Firefox is in the repository under <code>extension/</code>; see docs/capture.md.</p>
    </section>
  )
}
