// What each Settings page holds (OpenSpec changes ux-overhaul settings-navigation
// and settings-subpages): the cards of a one-page section, or of one sub-page of a
// section with an overview. Demo instances keep every card and disable the refused
// ones under one note at the top of the page.
import { lazy, type ReactNode, Suspense } from 'react'
import type { User } from '../lib/types'
import { LearnMore, Notice } from '../ui'
import { useDemo } from '../lib/demo'
import { useHosted } from '../lib/hosted'
import { t } from '../lib/i18n'
import { noticeCopy, SETTINGS_COPY } from '../lib/settingsCopy'
import { HowYouWorkSection } from './method/HowYouWorkSection'
import { ProfileSection } from './profile/ProfileSection'
import { DateTimeSection } from './DateTimeSettings'
import { AssistantsPanel } from './AssistantsPanel'
import { AppearanceSection, SidebarSection, TaskDetailsSection } from './AppearanceSection'
import { BackupsPanel } from './BackupsPanel'
import { QuickAddSettingsSection } from './QuickAddSettings'
import { VoiceSettingsSection } from './VoiceSettings'
import { CalendarSettingsSection } from './CalendarSettings'
import { PasswordSection } from './PasswordSection'
import { AdministrationSections } from './UsersPanel'
import { NotificationsSettings } from './NotificationsSettings'
import { NotificationChannelsCard } from './NotificationChannels'
import { DigestCard } from './DigestCard'
import { ActivityPanel } from './ActivityPanel'
import { AuditPanel } from './AuditPanel'
import { SecurityPanel } from './SecurityPanel'
import { LinkedAccountsPanel, SsoPanel } from './SsoPanel'
import { ProjectInvitePolicyPanel } from './ProjectInvitePolicyPanel'
import { MfaPolicyPanel, TwoFactorPanel } from './TwoFactorPanel'
import { EncryptionPanel } from './EncryptionPanel'
import { AboutSection } from './AboutSection'
import { TokensSection } from './TokensSection'
import { WebhooksPanel } from './WebhooksPanel'
import { CaldavPanel } from './CaldavPanel'
import { CalendarFeedsPanel } from './CalendarFeedsPanel'
import { IssuesPanel } from './IssuesPanel'
import { ConfigWarningsNotice } from './ConfigWarnings'
import { EmailInboxPanel } from './EmailInboxPanel'
import { BriefingSection, FocusSection, KeyboardSection, LanguageSection, StartViewSection } from './PreferencesPanels'
import { AutoArchiveSection } from './ProjectsSettings'
import { CaptureSection } from './CaptureSettings'
import { AttachmentSettingsPanel } from './AttachmentSettingsPanel'
import { OutgoingEmailPanel } from './OutgoingEmailPanel'
import { MapsServerPanel, MapsUserSection } from './locations/MapsSettings'
import { AutomationsServerPanel } from './rules/AutomationsSettings'
import { SpeechServerPanel } from './SpeechServerPanel'
import { BrandingPanel } from './BrandingPanel'
import { YourDataSection } from './DataSettings'
import { SessionPanel } from './AccountSettings'
import { ServerArchivePanel } from './ServerArchivePanel'
import { WorkspacesSettings } from './WorkspacesSettings'
import { demoFeatures, joinList, type SettingsPage, type SettingsSection } from './settingsSections'

// Settings → Integrations → Assistant (in-app-assistant): part of the lazy assistant code.
const AssistantSettingsSection = lazy(() => import('./assistant/AssistantSettings'))

interface PageProps { user: User; demo: boolean; hosted: boolean; onLogout: () => void }

/** The cards of each sub-page, by `<section>/<page>`. */
const PAGES: Record<string, (p: PageProps) => ReactNode> = {
  'account/profile': ({ user }) => <><Anchor id="profile"><ProfileSection user={user} /></Anchor><Anchor id="how-you-work"><HowYouWorkSection /></Anchor></>,
  'account/security': ({ user, demo, onLogout }) => (
    <>
      <Anchor id="security">
        <DemoDisabled on={demo}>
          <PasswordSection />
          <TwoFactorPanel user={user} />
          <SecurityPanel />
          <LinkedAccountsPanel />
        </DemoDisabled>
      </Anchor>
      <SessionPanel onLogout={onLogout} />
    </>
  ),
  'account/activity': () => <Anchor id="sessions"><ActivityPanel /></Anchor>,
  'account/encryption': ({ demo }) => <Anchor id="encryption"><DemoDisabled on={demo}><EncryptionPanel /></DemoDisabled></Anchor>,
  'general/start': () => <><StartViewSection /><BriefingSection /></>,
  'general/keyboard': () => <KeyboardSection />,
  'general/focus': () => <FocusSection />,
  'general/maps': () => <MapsUserSection />,
  'language/language': () => <LanguageSection />,
  'language/date-time': () => <DateTimeSection />,
  'language/calendar': () => <CalendarSettingsSection />,
  'appearance/theme': () => <AppearanceSection />,
  'appearance/sidebar': () => <SidebarSection />,
  'appearance/task-details': () => <TaskDetailsSection />,
  'notifications/push': ({ demo }) => <DemoDisabled on={demo}><NotificationsSettings /></DemoDisabled>,
  'notifications/channels': ({ user, demo }) => <DemoDisabled on={demo}><NotificationChannelsCard isOwner={user.role === 'owner'} /></DemoDisabled>,
  'notifications/digest': ({ demo }) => <DemoDisabled on={demo}><DigestCard /></DemoDisabled>,
  'capture/quick-add': () => <QuickAddSettingsSection />,
  'capture/voice': () => <VoiceSettingsSection />,
  'capture/browser': () => <CaptureSection />,
  'capture/email': ({ demo }) => <DemoDisabled on={demo}><EmailInboxPanel /></DemoDisabled>,
  'integrations/caldav': ({ user, demo }) => <DemoDisabled on={demo}><CaldavPanel isOwner={user.role === 'owner'} email={user.email} /></DemoDisabled>,
  'integrations/calendar-feeds': ({ user, demo }) => <DemoDisabled on={demo}><CalendarFeedsPanel isOwner={user.role === 'owner'} /></DemoDisabled>,
  'integrations/issues': ({ user, demo }) => <DemoDisabled on={demo}><IssuesPanel isOwner={user.role === 'owner'} /></DemoDisabled>,
  'integrations/webhooks': ({ user, demo, hosted }) => <DemoDisabled on={demo}><WebhooksPanel isOwner={user.role === 'owner' && !hosted} /></DemoDisabled>,
  'integrations/tokens': ({ demo }) => <DemoDisabled on={demo}><TokensSection /></DemoDisabled>,
  'integrations/assistant': ({ user, demo, hosted }) => (
    <Anchor id="ai"><DemoDisabled on={demo}><Suspense fallback={null}><AssistantSettingsSection isOwner={user.role === 'owner' && !hosted} /></Suspense></DemoDisabled></Anchor>
  ),
  'integrations/mcp': ({ user, demo, hosted }) => <DemoDisabled on={demo}><AssistantsPanel isOwner={user.role === 'owner' && !hosted} /></DemoDisabled>,
  'people/users': ({ user, demo }) => <><ConfigWarningsNotice user={user} /><DemoDisabled on={demo}><AdministrationSections user={user} /></DemoDisabled></>,
  'people/access-policies': ({ demo }) => <Anchor id="access-policies"><DemoDisabled on={demo}><MfaPolicyPanel /><ProjectInvitePolicyPanel /></DemoDisabled></Anchor>,
  'people/sso': ({ demo }) => <DemoDisabled on={demo}><SsoPanel /></DemoDisabled>,
  'server/backups': ({ demo }) => <DemoDisabled on={demo}><BackupsPanel /></DemoDisabled>,
  'server/download': () => <ServerArchivePanel />,
  'server/attachments': () => <AttachmentSettingsPanel />,
  // Outgoing email (outgoing-email change): the owner's SMTP settings; a demo instance never builds the mailer.
  'server/outgoing-email': ({ demo }) => <DemoDisabled on={demo}><OutgoingEmailPanel /></DemoDisabled>,
  // Branding (instance-branding): the owner's name and logo; a demo keeps the app's own.
  'server/branding': ({ demo }) => <DemoDisabled on={demo}><BrandingPanel /></DemoDisabled>,
  // Maps (task-locations D6): the owner's switch and providers; off on a demo unless OPENTODO_MAPS=on.
  'server/maps': ({ demo }) => <DemoDisabled on={demo}><MapsServerPanel /></DemoDisabled>,
  // Automation rules (automation-rules D9): the owner's switch; nothing runs on a demo.
  'server/automations': ({ demo }) => <DemoDisabled on={demo}><AutomationsServerPanel /></DemoDisabled>,
  // Speech to text (settings-refresh D7): the owner's speech service; never on a demo.
  'server/speech': ({ demo }) => <DemoDisabled on={demo}><SpeechServerPanel /></DemoDisabled>,
  'server/audit': () => <Anchor id="audit-log"><AuditPanel /></Anchor>,
}

/** The cards of a section that is one page (no overview). */
function SectionCards({ section, user, onLogout, demo, hosted }: { section: SettingsSection } & PageProps) {
  switch (section.id) {
    case 'workspaces':
      return <WorkspacesSettings user={user} />
    case 'about':
      return <AboutSection user={user} />
    case 'data':
      return <><YourDataSection demo={demo} isOwner={user.role === 'owner'} /><Anchor id="projects"><AutoArchiveSection /></Anchor></>
    default: {
      // A section whose only visible sub-page is the page itself (an admin's People).
      const only = section.pages?.find((p) => PAGES[`${section.id}/${p.id}`])
      return only ? <>{PAGES[`${section.id}/${only.id}`]({ user, onLogout, demo, hosted })}</> : null
    }
  }
}

/** The cards of a section or sub-page, under the demo note when the demo refuses some of them. */
export function SettingsPageContent({ section, page, sole, user, onLogout }: { section: SettingsSection; page: SettingsPage | null; sole?: SettingsPage | null; user: User; onLogout: () => void }) {
  const demo = !!useDemo()
  // A hosted service's operator owns the server-level settings (multi-tenant-host D4).
  const hosted = useHosted()
  const shown = page ?? sole ?? null
  const refused = demo ? demoFeatures(user, section, shown, hosted) : []
  const props = { user, onLogout, demo, hosted }
  const render = shown ? PAGES[`${section.id}/${shown.id}`] : undefined
  return (
    <>
      {refused.length > 0 && <DemoRestrictedNote features={refused} />}
      {render ? render(props) : <SectionCards section={section} {...props} />}
    </>
  )
}

/** The demo note on a section's overview, naming what its pages refuse. */
export function SectionDemoNote({ section, user }: { section: SettingsSection; user: User }) {
  const demo = !!useDemo()
  const hosted = useHosted()
  const refused = demo ? demoFeatures(user, section, null, hosted) : []
  return refused.length > 0 ? <DemoRestrictedNote features={refused} /> : null
}

/** A focusable landmark for a legacy address or a search result inside a page. */
function Anchor({ id, children }: { id: string; children: ReactNode }) {
  return <div id={id} tabIndex={-1} className="space-y-8 outline-none" data-settings-anchor={id}>{children}</div>
}

/** On a demo instance, the refused cards stay visible with their controls disabled (settings-navigation "Demo instance sections"). */
function DemoDisabled({ on, children }: { on: boolean; children: ReactNode }) {
  if (!on) return <>{children}</>
  return <fieldset disabled className="m-0 min-w-0 space-y-8 border-0 p-0" data-demo-disabled>{children}</fieldset>
}

/**
 * The demo note once at the top of a page, naming the rows whose controls are disabled:
 * one line, with Learn more opening the demo section of the getting-started guide
 * (settings-copy D6), which says what the sandbox is and how to run your own server.
 */
export function DemoRestrictedNote({ features }: { features: string[] }) {
  const learn = (
    <LearnMore screen={SETTINGS_COPY.demo.learnMore} topic={t('Demo instance')} className="text-meta" />
  )
  return (
    <div data-testid="demo-restricted">
      <Notice tone="info" action={learn}>
        {noticeCopy('demo', 'restricted', { variant: features.length === 1 ? 'one' : 'other', values: { features: joinList(features.map((x) => t(x))) } })}
      </Notice>
    </div>
  )
}
