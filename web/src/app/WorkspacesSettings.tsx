// Settings → Workspaces (OpenSpec changes workspaces, task 7.1, and
// workspaces-settings-v2): the account's workspaces as a list, and the open one
// beside it from 768 px (D1) with a header naming it and tabs for General,
// Members, Groups and Invites (D3). Below 768 px the list opens a workspace as
// its own view with Back. Workspaces are server data: every control waits for a
// connection, the lists come from the cache.
import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Icon, Notice, Tabs, useMediaQuery } from '../ui'
import { useDemo } from '../lib/demo'
import { useEncryption } from '../lib/e2ee'
import { t } from '../lib/i18n'
import { useWorkspaceMembers, useWorkspaceState } from '../lib/localData'
import { useOnline } from '../lib/online'
import { roleName } from '../lib/roleNames'
import type { User, Workspace } from '../lib/types'
import { requestNewWorkspace } from './NewWorkspaceDialog'
import { WorkspaceMark } from './WorkspaceControl'
import { workspaceLabel } from './workspaceNav'
import { cardCopy } from '../lib/settingsCopy'
import { WorkspaceGeneral } from './WorkspaceGeneral'
import { WorkspaceMembers } from './WorkspaceMembers'
import { WorkspaceGroups } from './WorkspaceGroups'
import { WorkspaceInvites } from './WorkspaceInvites'
import { manages } from './workspaceRoles'

/** From here the list and the open workspace sit side by side (D1). */
const TWO_PANES = '(min-width: 768px)'

/** The page. */
export function WorkspacesSettings({ user }: { user: User }) {
  const state = useWorkspaceState()
  const [selected, setSelected] = useState<string>('')
  // Below 768 px the list and the detail take turns (D1).
  const [drilled, setDrilled] = useState(false)
  const twoPanes = useMediaQuery(TWO_PANES)
  const id = selected || state.current
  const ws = state.list.find((w) => w.id === id) ?? state.list[0]
  const online = useOnline()
  const demo = !!useDemo()
  const encrypted = useEncryption().enabled
  const listRef = useRef<HTMLUListElement>(null)
  const back = () => {
    setDrilled(false)
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus())
  }
  const open = (w: Workspace) => { setSelected(w.id); setDrilled(true) }
  const showList = twoPanes || !drilled
  const showDetail = twoPanes || drilled
  const copy = cardCopy('workspaces-list')
  return (
    <div className="space-y-4" data-workspaces-settings>
      {!online && <Notice tone="info">{t('Workspaces need a connection to your server. The lists below are from this device.')}</Notice>}
      {demo && <Notice tone="info">{t('Creating workspaces, members, groups and invite links is not available on the demo.')}</Notice>}
      {encrypted && <Notice tone="info">{t('With end-to-end encryption you can create workspaces and move things between them, but not add members, groups or invite links yet.')}</Notice>}
      <div className="md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8" data-workspaces-panes>
        {showList && (
          <nav aria-label={copy.title} className="space-y-3" data-workspaces-list>
            <p className="text-meta text-muted">{copy.description}</p>
            <ul ref={listRef} className="space-y-0.5">
              {state.list.map((w) => (
                <WorkspaceListItem key={w.id} ws={w} current={w.id === ws?.id && (twoPanes || drilled)} onOpen={() => open(w)} />
              ))}
            </ul>
            <Button icon="plus" variant="ghost" onClick={requestNewWorkspace} disabled={!online || demo} data-settings-new-workspace className="w-full justify-start">{t('New workspace')}</Button>
          </nav>
        )}
        {showDetail && ws && (
          <WorkspaceDetail key={ws.id} ws={ws} user={user} online={online && !demo} encrypted={encrypted} onBack={twoPanes ? undefined : back} />
        )}
      </div>
    </div>
  )
}

/** One workspace in the list: the current one has an accent bar and is announced as current (D1). */
function WorkspaceListItem({ ws, current, onOpen }: { ws: Workspace; current: boolean; onOpen: () => void }) {
  const name = workspaceLabel(ws.name, ws.default)
  return (
    <li>
      <button type="button" onClick={onOpen} aria-current={current ? 'true' : undefined} data-workspace-row={ws.id}
        aria-label={t('{name}, {role}', { name, role: roleName(ws.role) })}
        className={`touch-target relative flex w-full items-center gap-2.5 rounded-control py-2 pl-3 pr-2 text-left text-body
          focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus
          ${current ? 'bg-accent-soft font-medium text-on-accent-soft' : 'text-default hover:bg-sunken dark:hover:bg-raised'}`}>
        {current && <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-accent" data-current-marker />}
        <WorkspaceMark workspace={ws} />
        <span className="user-text min-w-0 flex-1 truncate">{name}</span>
        <span className="shrink-0 text-hint text-muted">{ws.default ? t('Default') : roleName(ws.role)}</span>
        <span className="text-faint md:hidden"><Icon name="chevron-right" /></span>
      </button>
    </li>
  )
}

type TabId = 'general' | 'members' | 'groups' | 'invites'

function WorkspaceDetail({ ws, user, online, encrypted, onBack }: { ws: Workspace; user: User; online: boolean; encrypted: boolean; onBack?: () => void }) {
  const members = useWorkspaceMembers().filter((m) => m.workspaceId === ws.id)
  const [tab, setTab] = useState<TabId>('general')
  const headingRef = useRef<HTMLHeadingElement>(null)
  // On a phone the detail replaces the list: its heading takes focus.
  useEffect(() => { if (onBack) headingRef.current?.focus() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- once per opened workspace
  const canManage = manages(ws.role) && !ws.default
  const shared = online && !encrypted
  const tabs = ws.default ? [] : [
    { id: 'general', label: t('General') },
    { id: 'members', label: t('Members'), count: members.length },
    { id: 'groups', label: t('Groups') },
    ...(canManage ? [{ id: 'invites', label: t('Invites') }] : []),
  ]
  const general = <WorkspaceGeneral ws={ws} members={members} user={user} online={online} />
  return (
    <section aria-labelledby={`workspace-${ws.id}-name`} className="min-w-0 space-y-4" data-workspace-detail={ws.id}>
      {onBack && (
        <Button variant="ghost" icon="chevron-left" onClick={onBack} data-workspace-back className="-ml-2">{t('Workspaces')}</Button>
      )}
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-sunken"><WorkspaceMark workspace={ws} size={24} /></span>
        <div className="min-w-0 flex-1">
          <h2 ref={headingRef} tabIndex={-1} id={`workspace-${ws.id}-name`} className="user-text truncate text-title font-semibold text-default outline-none">{workspaceLabel(ws.name, ws.default)}</h2>
          <p className="text-meta text-muted">
            {ws.default ? t('Your default workspace') : t('{n, plural, one {# member} other {# members}} · {role}', { n: members.length, role: roleName(ws.role) })}
          </p>
        </div>
        {ws.default && <Badge>{t('Default')}</Badge>}
      </header>
      {ws.default
        ? general
        : (
          <Tabs tabs={tabs} value={tab} onChange={(v) => setTab(v as TabId)} label={t('{name} settings', { name: ws.name })}>
            <div className="pt-4">
              {tab === 'general' && general}
              {tab === 'members' && <WorkspaceMembers ws={ws} members={members} user={user} canManage={canManage} online={shared} />}
              {tab === 'groups' && <WorkspaceGroups ws={ws} members={members} canManage={canManage} online={shared} />}
              {tab === 'invites' && canManage && <WorkspaceInvites ws={ws} online={shared} />}
            </div>
          </Tabs>
        )}
    </section>
  )
}
