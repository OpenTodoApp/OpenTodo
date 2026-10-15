// Settings → Capture: bookmarklet and extension (OpenSpec share-capture; settings-redesign D3).
import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui'
import { Icon } from '../ui'
import { Notice } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { bookmarklet } from '../lib/share'
import { navigate } from './router'

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

  return <CaptureView code={code} linkRef={linkRef} copied={copied} onCopy={() => void copy()} />
}

/** Presentational part, rendered without effects for tests and stories. */
export function CaptureView({ code, linkRef, copied, onCopy }: {
  code: string; linkRef?: React.Ref<HTMLAnchorElement>; copied: 'yes' | 'failed' | null; onCopy: () => void
}) {
  return (
    <SettingsSection title="Capture" helpId="settings/capture" headingId="capture-heading"
      description="Save pages and selected text from your browser as tasks.">
      <SettingRow label="Bookmarklet" description={
        <>Drag <strong>Add to OpenTodo</strong> to your bookmarks bar. On any page, click it to add the page, its title and the selected text in a small window.
          It holds no password or token; it uses your sign-in on this server.</>
      } control={
        <>
          <a ref={linkRef} draggable className="ui-btn ui-btn--primary ui-btn--md cursor-grab" title="Drag to your bookmarks bar" onClick={(e) => e.preventDefault()}>
            <Icon name="plus" />Add to OpenTodo
          </a>
          <Button icon="copy" onClick={onCopy}>Copy bookmarklet</Button>
        </>
      } />
      {copied === 'yes' && <Notice tone="success">Copied. Create a bookmark and paste it as the address.</Notice>}
      {copied === 'failed' && (
        <label className="block py-2 text-meta text-muted">
          Copy this code and paste it as a bookmark's address:
          <textarea className="input mt-1 font-mono text-meta" readOnly rows={3} value={code} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
      <SettingRow label="Browser extension" description={<>For Chromium and Firefox, in the repository under <code>extension/</code>.</>}
        control={<a className="ui-btn ui-btn--secondary ui-btn--md" href="/help/capture" onClick={(e) => { e.preventDefault(); navigate({ view: 'help', page: 'capture' }) }}><Icon name="circle-help" />How to install</a>} />
      <SettingRow label="On a phone" description="Install the app and use your phone's share menu." />
    </SettingsSection>
  )
}
