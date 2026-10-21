// Settings → About (OpenSpec change welcome-note): the version, the documentation,
// the website, the source code, where to report a problem, the Discord server
// (discord-community), Buy Me a Coffee, and the
// owner's welcome note on demand. Every link is a plain link opening a new tab;
// the version comes from this server's status while online.
import { useEffect, useState } from 'react'
import { Badge, Icon, Notice, SettingRow, SettingsSection } from '../ui'
import { api } from '../lib/api'
import { t } from '../lib/i18n'
import { useOnline } from '../lib/online'
import type { User } from '../lib/types'
import { navigate } from './router'
import { CoffeeButton, DISCORD_URL, ISSUES_URL, REPO_URL, WelcomeNote } from './WelcomeDialog'
import { cardCopy, rowCopy } from '../lib/settingsCopy'
import { shell, shellOutdated, type OpenTodoShell } from '../lib/shell'

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

const PLATFORM_NAME: Record<OpenTodoShell['platform'], string> = { android: 'Android', ios: 'iOS', desktop: 'desktop' }

/** The native shell this page runs in (native-shells): its name and version, and a notice when it is older than this server expects. */
export function ShellAppRow({ app }: { app: { platform: OpenTodoShell['platform']; version: string; outdated: boolean } | null }) {
  if (!app) return null
  return (
    <>
      <SettingRow id="about-shell" label={t('OpenTodo for {platform}', { platform: PLATFORM_NAME[app.platform] ?? app.platform })}
        status={<Badge hue="slate">{app.version}</Badge>} />
      {app.outdated && <Notice tone="warning">{t('This app is older than this server expects. Update OpenTodo from your app store to keep everything working.')}</Notice>}
    </>
  )
}

export function AboutSection({ user }: { user: User }) {
  const version = useServerVersion()
  const s = shell()
  const app = s ? { platform: s.platform, version: s.app, outdated: shellOutdated() } : null
  const [note, setNote] = useState(false)
  return (
    <>
      <SettingsSection {...cardCopy('about', { variant: version ? 'version' : 'plain', values: { version } })}>
        <ShellAppRow app={app} />
        <SettingRow id="about-help" {...rowCopy('about', 'help')}
          control={<button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={() => navigate({ view: 'help' })} data-about-help>{t('Open Help')}</button>} />
        <SettingRow id="about-docs" {...rowCopy('about', 'docs')}
          control={<ExternalLink href={DOCS_URL} label={t('Read the docs')} testId="docs" />} />
        <SettingRow id="about-website" {...rowCopy('about', 'website')}
          control={<ExternalLink href={WEBSITE_URL} label="open-todo.app" testId="website" />} />
        <SettingRow id="about-feedback" {...rowCopy('about', 'feedback')}
          control={<ExternalLink href={ISSUES_URL} label={t('Open an issue')} testId="issues" />} />
        <SettingRow id="about-community" {...rowCopy('about', 'community')}
          control={<ExternalLink href={DISCORD_URL} label={t('Join on Discord')} testId="discord" />} />
        <SettingRow id="about-source" {...rowCopy('about', 'source')}
          control={<ExternalLink href={REPO_URL} label="GitHub" testId="source" />} />
        {user.role === 'owner' && (
          <SettingRow id="about-welcome" {...rowCopy('about', 'welcome')}
            control={<button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={() => setNote(true)} data-about-welcome>{t('Show it again')}</button>} />
        )}
      </SettingsSection>
      <SettingsSection {...cardCopy('about-support')}>
        <div className="pt-1"><CoffeeButton className="sm:w-64" /></div>
      </SettingsSection>
      {note && <WelcomeNote onClose={() => setNote(false)} />}
    </>
  )
}
