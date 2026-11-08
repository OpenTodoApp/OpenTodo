// Settings → About → What's new (OpenSpec `whats-new`, design D1, D2, D3, D5). Loaded lazily
// with About, so the entries are not in the first load. The card records on this device that
// the person read it when it leaves the screen; the dots stay until then.
import { useEffect, useRef } from 'react'
import news from '../generated/news.json'
import { Icon, Switch, SettingRow, SettingsSection } from '../ui'
import { currentLanguage, t, useLanguageVersion } from '../lib/i18n'
import { cardCopy, rowCopy } from '../lib/settingsCopy'
import { newsNotices, newsSeen, newsVersionToRecord, releaseUrl, useNewsDot } from '../lib/whatsNew'
import { NewsDot } from './NewsDot'

export interface NewsEntry {
  version: string
  date: string
  body: string
}

interface Props {
  /** The server's version while online, or null. */
  serverVersion: string | null
  /** The entries to show (the compiled ones unless a test passes its own). */
  entries?: readonly NewsEntry[]
}

const LINK = 'ui-btn ui-btn--secondary ui-btn--sm inline-flex items-center gap-1.5 whitespace-nowrap'

function ReleaseLink({ version }: { version: string }) {
  return (
    <a href={releaseUrl(version)} target="_blank" rel="noopener noreferrer" className={LINK} data-whats-new-release={version}>
      {t('Release notes on GitHub')}<Icon name="external-link" size="xs" />
    </a>
  )
}

export default function WhatsNew({ serverVersion, entries = news.entries }: Props) {
  useLanguageVersion()
  const notices = newsNotices.use()
  const dot = useNewsDot(serverVersion)
  // The version to record is the one this card was shown for; the last one wins if the server answers late.
  const toRecord = useRef(newsVersionToRecord(serverVersion))
  toRecord.current = newsVersionToRecord(serverVersion)
  useEffect(() => () => {
    const version = toRecord.current
    if (version) newsSeen.set(version)
  }, [])

  const [newest, ...earlier] = entries
  const english = currentLanguage() === 'en'
  return (
    <SettingsSection {...cardCopy('about-news')} id="about-whats-new" testId="whats-new">
      {dot && <p className="mb-2 flex items-center gap-2 text-meta text-muted" data-whats-new-dot><NewsDot />{t('New notes for this version')}</p>}
      <SettingRow id="whats-new-notices" {...rowCopy('about-news', 'notices')}
        control={<Switch checked={notices} onChange={(on) => newsNotices.set(on)} label={t('Version notices')} hideLabel />} />
      {!english && newest && <p className="mb-2 rounded-control bg-sunken px-3 py-2 text-meta text-muted dark:bg-raised" data-whats-new-english-note>{t('These notes are in English.')}</p>}
      {newest ? (
        <article className="mt-3 space-y-2" data-whats-new-newest={newest.version}>
          <h3 className="text-body font-medium text-strong">{newest.version} <span className="text-meta font-normal text-muted">{newest.date}</span></h3>
          <p className="text-body text-default">{newest.body}</p>
          <ReleaseLink version={newest.version} />
        </article>
      ) : (
        <p className="mt-3 text-body text-muted" data-whats-new-empty>{t('Nothing new in this version yet.')}</p>
      )}
      {earlier.length > 0 && (
        <details className="mt-3" data-whats-new-earlier>
          <summary className="cursor-pointer text-body font-medium text-default">{t('Earlier versions')}</summary>
          <ul className="mt-2 space-y-1">
            {earlier.map((e) => (
              <li key={e.version} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-muted">
                <span>{e.version} · {e.date}</span>
                <ReleaseLink version={e.version} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </SettingsSection>
  )
}
