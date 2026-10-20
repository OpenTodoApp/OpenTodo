// Settings → Capture: bookmarklet and extension (OpenSpec share-capture; settings-redesign D3).
import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui'
import { Tooltip } from '../ui'
import { Icon } from '../ui'
import { Notice } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { bookmarklet } from '../lib/share'
import { navigate } from './router'
import { t } from '../lib/i18n'
import { cardCopy, noticeCopy, rowCopy, SETTINGS_COPY } from '../lib/settingsCopy'

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
    <SettingsSection {...cardCopy('capture')}>
      <SettingRow label={rowCopy('capture', 'bookmarklet').label} description={
        <>{t.rich(SETTINGS_COPY.capture.rows.bookmarklet.description, { strong: (chunks) => <strong>{chunks}</strong> })}</>
      } control={
        <>
          <Tooltip label={t('Drag to your bookmarks bar')}>
            <a ref={linkRef} draggable className="ui-btn ui-btn--primary ui-btn--md cursor-grab" onClick={(e) => e.preventDefault()}>
              <Icon name="plus" />{t('Add to OpenTodo')}
            </a>
          </Tooltip>
          <Button icon="copy" onClick={onCopy}>{t('Copy bookmarklet')}</Button>
        </>
      } />
      {copied === 'yes' && <Notice tone="success">{noticeCopy('capture', 'copied')}</Notice>}
      {copied === 'failed' && (
        <label className="block py-2 text-meta text-muted">
          {t('Copy this code and paste it as a bookmark\'s address:')}
          <textarea className="ui-input mt-1 font-mono text-meta" readOnly rows={3} value={code} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
      <SettingRow label={rowCopy('capture', 'extension').label} description={<>{t.rich(SETTINGS_COPY.capture.rows.extension.description, { path: <code>extension/</code> })}</>}
        control={<a className="ui-btn ui-btn--secondary ui-btn--md" href="/help/capture" onClick={(e) => { e.preventDefault(); navigate({ view: 'help', page: 'capture' }) }}><Icon name="circle-help" />{t('How to install')}</a>} />
      <SettingRow {...rowCopy('capture', 'phone')} />
    </SettingsSection>
  )
}
