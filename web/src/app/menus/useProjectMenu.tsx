// The project menu, whole (OpenSpec change sidebar-project-menu): one hook builds it for
// the project header and for the project's sidebar row, so both offer the same items with
// the same handlers and dialogs (labels-and-menus D1). The page adds its own items around
// the panels group (Show completed tasks, Print…) and its layout's groups. A sidebar row
// passes `active` only while its menu is open, so a long sidebar keeps no live queries
// for menus nobody opened.
import { type ReactNode, useMemo, useState } from 'react'
import { useMembership, useProjects } from '../../lib/localData'
import { useProjectPrefsRow } from '../../lib/liveData'
import { setFavourite } from '../../lib/favourites'
import { t } from '../../lib/i18n'
import { canEditProject } from '../../lib/sharing'
import { useMethodMode } from '../../lib/method/mode'
import { keysOf } from '../../lib/shortcuts'
import { openAssistantWith, useAssistantStatus } from '../../lib/assistantStatus'
import type { Project } from '../../lib/types'
import { DEFAULT_DISPLAY_OPTIONS } from '../display/displayOptions'
import { FieldsDialog } from '../FieldsDialog'
import { HistoryPanel } from '../HistoryPanel'
import { closePanel, openPanel, usePanelOccupantKey } from '../panel'
import { PanelFrame } from '../PanelFrame'
import { ProjectActivity } from '../ProjectActivity'
import { moveTargets, projectMenuGroups } from './projectMenu'
import { navigate, useRoute } from '../router'
import { ShareDialog } from '../ShareDialog'
import { openConnections, useConnected } from '../signals'
import { DuplicateProjectDialog, SaveTemplateDialog } from '../TemplateDialogs'
import { useIsFavourite } from '../useFavourites'
import { useOtherWorkspaces } from '../workspaceNav'
import type { ActionGroup, ActionItem } from './ActionMenu'
import { ColourSwatches, setProjectColour } from './projectAppearance'

const ACTIVITY_PANEL = 'project-activity'
const HISTORY_PANEL = 'project-history'

export interface ProjectMenuPage {
  /** Items the page puts first in the panels group (Show completed tasks). */
  before?: ActionItem[]
  /** Items the page puts last in the panels group (Print…). */
  after?: ActionItem[]
  /** The layout's groups (a board's Colour by, calendar-clarity D3). */
  extra?: ActionGroup[]
  /** The open tasks the page already counts; the confirmations read it themselves without. */
  openTasks?: number
  /** The Public badge's count, which the share dialog updates (public-links). */
  onPublicLinks?: (n: number) => void
}

export function useProjectMenu(project: Project, o: { userId?: string; rename: () => void; active?: boolean; page?: ProjectMenuPage }) {
  const active = o.active ?? true
  const membership = useMembership(project.id)
  const role = membership?.role ?? 'owner'
  const editable = canEditProject(role)
  const [sharing, setSharing] = useState<false | true | 'public'>(false)
  const [dialog, setDialog] = useState<'duplicate' | 'template' | 'fields' | null>(null)
  const projects = useProjects()
  const targets = useMemo(() => (active ? moveTargets(project, projects) : []), [active, projects, project])
  const subCount = useMemo(() => projects.filter((p) => p.parent_id === project.id && !p.deleted_at).length, [projects, project.id])
  const pinned = useIsFavourite('project', project.id)
  const otherWorkspaces = useOtherWorkspaces()
  const mode = useMethodMode()
  const reviewEvery = useProjectPrefsRow(active ? project.id : null)?.review_every
  const connected = useConnected('project', active ? project.id : undefined)
  const assistantAvailable = !!useAssistantStatus()?.available
  const occupant = usePanelOccupantKey()
  const route = useRoute()
  // Archiving or deleting the project on screen goes to the Inbox; from another page the page stays.
  const left = () => { if (route.view === 'project' && route.id === project.id) navigate({ view: 'inbox' }) }

  // Activity and History are occupants of the shell's panel slot (app-shell "The panel slot has an address").
  const showActivity = () => (occupant === ACTIVITY_PANEL ? closePanel() : openPanel(ACTIVITY_PANEL, () => <PanelFrame title={t('Activity')} testId="project-activity"><ProjectActivity project={project} /></PanelFrame>))
  const showHistory = () => (occupant === HISTORY_PANEL ? closePanel() : openPanel(HISTORY_PANEL, () => <PanelFrame title={t('History')} testId="project-history"><HistoryPanel entity="project" id={project.id} readOnly={!editable} embedded /></PanelFrame>))

  const panels: ActionGroup = { items: [
    ...(o.page?.before ?? []),
    { kind: 'action', id: 'activity', label: t('Activity'), icon: 'history', shortcut: keysOf('project.activity'), onSelect: showActivity },
    { kind: 'action', id: 'history', label: t('History'), icon: 'rotate-ccw', onSelect: showHistory },
    // What links with the project (notes-graph D3), offered while something does.
    ...(connected ? [{ kind: 'action' as const, id: 'connections', label: t('Show connections'), icon: 'waypoints' as const, onSelect: () => openConnections('project', project.id) }] : []),
    // The project's routines on the Routines page (routines-shared D12).
    { kind: 'action', id: 'routines', label: t('Routines'), icon: 'zap', onSelect: () => navigate({ view: 'rules', project: project.id }) },
    // Display mode (display-mode D6): the project in large type, without the shell.
    { kind: 'action', id: 'display', label: t('Display mode'), icon: 'monitor', onSelect: () => navigate({ view: 'display', target: { kind: 'project', id: project.id }, options: { ...DEFAULT_DISPLAY_OPTIONS } }) },
    ...(o.page?.after ?? []),
  ] }
  // What's next? (assistant-in-context): the project-next skill on this project, while the assistant is available.
  const assistantGroup: ActionGroup[] = assistantAvailable ? [{ label: t('Assistant'), items: [{ kind: 'action', id: 'assistant-next', label: t('What’s next?'), icon: 'sparkles',
    onSelect: () => openAssistantWith({ skill: 'project-next', text: t('What’s next in “{name}”?', { name: project.name }), send: true }) }] }] : []
  // Every role gets the copies (project-templates D6); editing items follow the role inside projectMenuGroups.
  const groups: ActionGroup[] = [
    ...projectMenuGroups(project, { role, shared: !!membership, targets, subCount, openTasks: o.page?.openTasks, pinned, workspaces: otherWorkspaces, mode, reviewEvery },
      { rename: o.rename, duplicate: () => setDialog('duplicate'), saveTemplate: () => setDialog('template'), fields: () => setDialog('fields'), pin: () => setFavourite('project', project.id, !pinned), left }),
    ...(o.page?.extra ?? []),
    ...assistantGroup,
    panels,
  ]
  const swatches = editable ? <ColourSwatches color={project.color} onPick={(color) => setProjectColour(project, color)} menu /> : undefined
  const dialogs: ReactNode = <>
    {sharing && <ShareDialog project={project} userId={o.userId ?? ''} cached={membership ?? undefined} section={sharing === 'public' ? 'public' : undefined}
      onPublicLinks={o.page?.onPublicLinks} onClose={() => setSharing(false)} />}
    {dialog === 'duplicate' && <DuplicateProjectDialog project={project} shared={!!membership} onClose={() => setDialog(null)} />}
    {dialog === 'template' && <SaveTemplateDialog project={project} onClose={() => setDialog(null)} />}
    {dialog === 'fields' && <FieldsDialog project={project} onClose={() => setDialog(null)} />}
  </>
  return { groups, swatches, dialogs, membership, role, editable, share: (section?: 'public') => setSharing(section ?? true), fields: () => setDialog('fields'), activity: showActivity }
}
