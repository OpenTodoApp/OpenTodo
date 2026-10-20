// Settings → About (OpenSpec change welcome-note): the version, the documentation,
// the website, the source code, where to report a problem, the Discord server
// (discord-community), Buy Me a Coffee, and the
// owner's welcome note on demand. Every link is a plain link opening a new tab;
// the version comes from this server's status while online.
import { useEffect, useState } from 'react'
import { Icon, SettingRow, SettingsSection } from '../ui'
import { api } from '../lib/api'
import { t } from '../lib/i18n'
import { useOnline } from '../lib/online'
import type { User } from '../lib/types'
import { navigate } from './router'
import { CoffeeButton, DISCORD_URL, ISSUES_URL, REPO_URL, WelcomeNote } from './WelcomeDialog'

export const WEBSITE_URL = 'https://open-todo.app'
export const DOCS_URL = 'https://open-todo.app/docs/'

function ExternalLink({ href, label, testId }: { href: string; label: string; testId: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" data-about-link={testId}
      className="ui-btn ui-btn--secondary ui-btn--sm inline-flex items-center gap-1.5 whitespace-nowrap">
      {label}<Icon name="external-link" size="xs" />
    </a>
  )
}

/** The server's version while online; null before it is known or offline. */
function useServerVersion(): string | null {
  const online = useOnline()
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    if (!online) return
    let cancelled = false
    api.authStatus().then((s) => { if (!cancelled) setVersion(s.version || null) }, () => {})
    return () => { cancelled = true }
  }, [online])
  return version
}

export function AboutSection({ user }: { user: User }) {
  const version = useServerVersion()
  const [note, setNote] = useState(false)
  return (
    <>
      <SettingsSection title={t('About OpenTodo')} headingId="about-heading"
        description={version
          ? t('OpenTodo {version} · free and open source (AGPL-3.0) · no tracking, no telemetry', { version })
          : t('Free and open source (AGPL-3.0) · no tracking, no telemetry')}>
        <SettingRow id="about-help" label={t('Help')} description={t('The guides of this version, inside the app and offline.')}
          control={<button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={() => navigate({ view: 'help' })} data-about-help>{t('Open Help')}</button>} />
        <SettingRow id="about-docs" label={t('Documentation')} description={t('The same guides on the website, with setup and self-hosting.')}
          control={<ExternalLink href={DOCS_URL} label={t('Read the docs')} testId="docs" />} />
        <SettingRow id="about-website" label={t('Website')} description={t('News, guides, comparisons and what is new in each release.')}
          control={<ExternalLink href={WEBSITE_URL} label="open-todo.app" testId="website" />} />
        <SettingRow id="about-feedback" label={t('Share feedback or report a problem')} description={t('Open an issue on GitHub. Every report is read.')}
          control={<ExternalLink href={ISSUES_URL} label={t('Open an issue')} testId="issues" />} />
        <SettingRow id="about-community" label={t('Community')} description={t('Questions, ideas and other people who use OpenTodo, on Discord.')}
          control={<ExternalLink href={DISCORD_URL} label={t('Join on Discord')} testId="discord" />} />
        <SettingRow id="about-source" label={t('Source code')} description={t('A star on GitHub helps other people find it.')}
          control={<ExternalLink href={REPO_URL} label="GitHub" testId="source" />} />
        {user.role === 'owner' && (
          <SettingRow id="about-welcome" label={t('Welcome note')} description={t('The thank-you shown the first time you opened this server.')}
            control={<button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={() => setNote(true)} data-about-welcome>{t('Show it again')}</button>} />
        )}
      </SettingsSection>
      <SettingsSection title={t('Support OpenTodo')} headingId="about-support-heading"
        description={t('OpenTodo has no paid plan: every feature is free. If it saves you a subscription, a coffee helps keep it going.')}>
        <div className="pt-1"><CoffeeButton className="sm:w-64" /></div>
      </SettingsSection>
      {note && <WelcomeNote onClose={() => setNote(false)} />}
    </>
  )
}
