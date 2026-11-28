import type { Meta, StoryObj } from '@storybook/react-vite'
import * as Calendar from './calendar.stories'
import * as Phone from './phone.stories'
import * as Settings from './settings.stories'
import * as ShellStories from './shell.stories'
import * as Sidebar from './sidebar.stories'
import * as TaskList from './taskList.stories'
import { seedCalendarWeek, seedInbox, withSeed } from './stories/fixtures'

// Right to left (OpenSpec change arabic-rtl, design D7): the screens people live in,
// in Arabic, beside their left-to-right stories. The fixtures keep their English
// titles, so a baseline also shows Latin text inside the right-to-left layout.
// The visual gate keeps a baseline for each, light and dark, at 375 and 1280 px.
const meta: Meta = { title: 'Screens/Right to left', parameters: { direction: 'rtl' }, globals: { locale: 'ar' } }
export default meta

/** The shell with the Inbox: the sidebar on the right, rows from the right, the menu buttons on the left. */
export const Inbox: StoryObj = { ...ShellStories.ListOnly }

/** A task as its page: Back points right, the breadcrumb reads from the right. */
export const TaskPage: StoryObj = { ...ShellStories.TaskPage }

/** Today with Earlier and Today: times at the end, the disclosure chevrons point left. */
export const Today: StoryObj = { ...TaskList.TodayGrouped }

/** A project with the task panel docked on the end side (the left). */
export const ProjectSidePanel: StoryObj = { ...TaskList.ProjectSidePanelSelected }

/** Week: Monday at the right, events in their lanes from the right. */
export const Week: StoryObj = { ...withSeed(seedCalendarWeek), ...Calendar.Week }

/** The sidebar: indentation, counts and the fold chevrons mirrored. */
export const SidebarProjects: StoryObj = { ...withSeed(seedInbox), ...Sidebar.Default }

/** Settings: the section list and the select chevrons at the start edge. */
export const SettingsSection: StoryObj = { ...Settings.SectionPage }

/** A phone's Today: the menu at the right of the bar, rows that keep one cell. */
export const PhoneToday: StoryObj = { ...Phone.Today }

/** Swipes on a phone: Complete comes in from the right, Schedule from the left. */
export const PhoneRowSwipe: StoryObj = { ...Phone.RowMidSwipe }
