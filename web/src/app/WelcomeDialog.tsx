// The owner's welcome note (OpenSpec change welcome-note): the first time the
// owner opens a new server, a dialog thanks them for installing OpenTodo and
// points to the issue tracker, the GitHub star and the Buy Me a Coffee page.
// It shows once per account: closing it is an ordinary preference op
// (`welcome`) that syncs to the owner's other devices. Members, the demo and
// accounts older than a week or already holding tasks never see it.
// The links are plain links: nothing is loaded from those sites.
import { useRef } from 'react'
import { Button, Dialog, Icon, type IconName } from '../ui'
import { useDemo } from '../lib/demo'
import { t } from '../lib/i18n'
import { useHasTask, useUserPrefsRow } from '../lib/localData'
import type { User } from '../lib/types'
import { setWelcomeSeen, welcomeSeen } from '../lib/userPrefs'
import { act } from './actionError'

export const ISSUES_URL = 'https://github.com/pixari/opentodo/issues'
export const REPO_URL = 'https://github.com/pixari/opentodo'
export const COFFEE_URL = 'https://buymeacoffee.com/pixari'

/** How long after the owner account was created the note may still appear. */
const WELCOME_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Whether the note belongs on screen: the owner, not on the demo, not seen yet,
 * on a fresh account (created in the last week, no task yet when the app first
 * opened). Once shown it stays until it is closed, even when a task arrives meanwhile.
 */
export function useWelcome(user: Pick<User, 'role' | 'createdAt'>, now = Date.now()): boolean {
  const row = useUserPrefsRow()
  const hasTask = useHasTask()
  const demo = useDemo()
  const shown = useRef(false)
  const fresh = typeof user.createdAt === 'number' && user.createdAt > 0 && now - user.createdAt < WELCOME_WINDOW_MS
  if (user.role !== 'owner' || demo || !fresh) return false
  if (row === undefined || hasTask === undefined) return false
  if (welcomeSeen(row)) { shown.current = false; return false }
  if (!hasTask) shown.current = true
  return shown.current
}

function LinkRow({ href, icon, title, detail }: { href: string; icon: IconName; title: string; detail: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" data-welcome-link={icon}
      className="flex items-start gap-3 rounded-control px-3 py-2.5 hover:bg-sunken focus-visible:bg-sunken dark:hover:bg-raised dark:focus-visible:bg-raised">
      <Icon name={icon} className="mt-0.5 shrink-0 text-muted" />
      <span className="min-w-0 flex-1">
        <span className="block text-body font-medium">{title}</span>
        <span className="block text-meta text-muted">{detail}</span>
      </span>
      <Icon name="external-link" size="xs" className="mt-1 shrink-0 text-faint" />
    </a>
  )
}

export function WelcomeDialog({ user }: { user: User }) {
  const open = useWelcome(user)
  if (!open) return null
  const close = () => act(setWelcomeSeen())
  return (
    <Dialog title={t('Thanks for installing OpenTodo')} onClose={close} size="md" testId="welcome">
      <div className="space-y-4 p-4">
        <p className="text-body">
          {t('OpenTodo is free and open source, made by one person in the open. It is yours now: your server, your data, no subscription.')}
        </p>
        <div className="-mx-1 space-y-0.5">
          <LinkRow href={ISSUES_URL} icon="message-circle" title={t('Share feedback or report a problem')} detail={t('Open an issue on GitHub. Every report is read.')} />
          <LinkRow href={REPO_URL} icon="star" title={t('Star OpenTodo on GitHub')} detail={t('A star helps other people find it.')} />
        </div>
        <a href={COFFEE_URL} target="_blank" rel="noopener noreferrer" data-welcome-coffee
          className="flex items-center justify-center gap-2 rounded-control bg-coffee px-4 py-2.5 text-body font-semibold text-on-coffee shadow-1 hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <Icon name="coffee" />
          {t('Buy me a coffee')}
        </a>
        <p className="text-meta text-muted">{t('This message will not appear again. The same links are in Help.')}</p>
        <div className="flex justify-end">
          <Button variant="primary" onClick={close} data-welcome-close data-autofocus>{t('Start using OpenTodo')}</Button>
        </div>
      </div>
    </Dialog>
  )
}
