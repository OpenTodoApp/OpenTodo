// Settings → About → App code (OpenSpec change signed-web-app, design D10):
// who signed the code this device runs, the key's short fingerprint linking to
// the website's Security page, Verify, the last check's result with its cause
// (D18), and a diagnostics line to copy. Read from the service worker's trust
// record; without one (no worker yet, a plain-http address, `make dev`), no row.
import { useEffect, useState } from 'react'
import { compareVersions, shortFingerprint } from '../lib/appCode'
import { causeMessage, REFUSED, REPORTED, SIGNED_UPDATES_PAGE, WHAT_TO_DO } from '../lib/appCodeCopy'
import { diagnosticsLine, loadTrust, officialFingerprints, type TrustRecord } from '../lib/appTrust'
import { t } from '../lib/i18n'
import { Badge, Icon, Notice, SettingRow } from '../ui'
import { navigate } from './router'

export const SECURITY_URL = 'https://open-todo.app/security#app-signing'
export const VERIFY_URL = 'https://open-todo.app/security/verify'

/** The trust record and whether its key is an official one; undefined while loading. */
function useTrust(): { record: TrustRecord | null | undefined; official: boolean } {
  const [state, setState] = useState<{ record: TrustRecord | null | undefined; official: boolean }>({ record: undefined, official: false })
  useEffect(() => {
    let live = true
    loadTrust()
      .then(async (record) => ({ record, official: !!record?.signer && (await officialFingerprints()).includes(record.signer) }))
      .then((s) => { if (live) setState(s) }, () => { if (live) setState({ record: null, official: false }) })
    return () => { live = false }
  }, [])
  return state
}

function status(r: TrustRecord, official: boolean): string {
  if (r.mode === 'signed') return official ? t('Signed by OpenTodo') : t("Signed with this server's key")
  return r.mode === 'preview' ? t('Preview build') : t('Self-built')
}

export function AppCodeView({ record, official, serverVersion }: { record: TrustRecord; official: boolean; serverVersion: string | null }) {
  const [copied, setCopied] = useState(false)
  const version = record.current?.version
  const differs = !!version && !!serverVersion && compareVersions(serverVersion, '0.0.0') > 0 && compareVersions(version, serverVersion) !== 0
  const signed = record.mode === 'signed' && !!record.signer
  const description = (
    <>
      {signed
        ? <a href={SECURITY_URL} target="_blank" rel="noopener noreferrer" className="font-mono underline" data-app-code-fingerprint>{shortFingerprint(record.signer!)}</a>
        : t('Updates are not signature-checked.')}
      {version && <> · {t('Version {version}', { version })}</>}
      {differs && <> · {t('This server runs {version}', { version: serverVersion })}</>}
    </>
  )
  const copy = () => {
    navigator.clipboard?.writeText(diagnosticsLine(record)).then(() => setCopied(true), () => {})
  }
  const check = record.lastCheck
  return (
    <>
      <SettingRow id="about-app-code" label={t('App code')} status={<Badge hue={signed ? 'green' : 'slate'}>{status(record, official)}</Badge>} description={description}
        control={
          <>
            {signed && (
              <a href={`${VERIFY_URL}#${record.signer}`} target="_blank" rel="noopener noreferrer" data-app-code-verify
                className="ui-btn ui-btn--secondary ui-btn--sm inline-flex items-center gap-1.5 whitespace-nowrap">
                {t('Verify key')}<Icon name="external-link" size="xs" />
              </a>
            )}
            <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={copy} data-app-code-copy>
              {copied ? t('Copied.') : t('Copy diagnostics')}
            </button>
          </>
        } />
      {check && !check.passed && (
        <Notice tone="warning" action={
          <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={() => navigate({ view: 'help', page: SIGNED_UPDATES_PAGE })} data-app-code-help>{t(WHAT_TO_DO)}</button>
        }>
          <span data-app-code-check={check.refused ? 'refused' : 'reported'}>
            {t(check.refused ? REFUSED : REPORTED)} {t(causeMessage(check.cause, signed && !official))}
          </span>
        </Notice>
      )}
    </>
  )
}

export function AppCodeRow({ serverVersion }: { serverVersion: string | null }) {
  const { record, official } = useTrust()
  if (!record) return null
  return <AppCodeView record={record} official={official} serverVersion={serverVersion} />
}
