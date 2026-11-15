# Proposal

## Why

A tablet held upright is 768 px wide. The sidebar takes 256 px of it, so a page header has about 500 px, with 44 px touch controls, and it still gets everything a 1280 px header gets (GitHub issue [#1379](https://github.com/OpenTodoApp/OpenTodo/issues/1379), from the interface tour at 768 px with touch):

- **Inbox.** The title, the lead line, Process, Select, Filter, Display options, the menu and Help share one row; the lead line reads "3 to …".
- **A task's page.** The path reads "Inbo ›" while the task's title, which is the page's heading just below, takes the rest of the line; the position, Next, Previous, Close, the menu and Help stand on a second row.
- **Statistics.** The five periods wrap onto two rows in their box and the menu has a third (`phone-stats-period` fixed this below 768 px only).
- **A project.** A long name takes the first row, the progress, members and Public badge the second, the actions the third. The board then has four rows of chrome above its first card.

The phone rules already solve each of these (`phone-header-room`, `phone-bar-overflow`, `phone-stats-period`), but they follow the window: below 768 px. A 768 px window with the sidebar open and a 500 px window leave the same header.

## What Changes

- **A header follows its own width.** A page header narrower than 40 rem on a touch screen (28 rem with a mouse, where controls are 32 px, not 44) is a narrow header. It applies the phone bar's rules in its own row:
  - Help is the last item of the page's menu; a page without a menu keeps the button.
  - A list (Inbox, Today, Upcoming, a project, a label, the other lists) shows Process or Ask, an active filter's chip and Display options; Select tasks, the duration filter, Display mode, a project's Layout, Share and Add a note are items of its menu.
  - The title gives way before the actions wrap under it.
- **A lead line shows whole or not at all**, at every width. "3 to sort" is never "3 to …". In a narrow header a project's lead is the plain text the phone bar shows ("50% done · 2 · owner"); members and public links open from Share in the menu.
- **A task's page in a narrow header** shows the nearest step up as a back arrow with its name ("← Inbox"). The task's title is not repeated in the path. A name that does not fit is hidden and the arrow carries it as its accessible name.
- **Statistics in a narrow header** is one row: the title, the period as one menu button, the menu with Export time entries.
- **A routine's page**: the routine's name in "Routines › name" shows in full on hover and keyboard focus while it is cut.
- **Nothing changes in a header of 40 rem or more** (a 768 px window with the sidebar collapsed, 1024 px, 1280 px), or with a mouse above 28 rem, except that a lead line that used to be cut is now hidden.

Out of scope: the phone bar below 768 px; the calendar's header (its range and view switch still take a second row at 768 px, down from three rows to two because Help moved); the Routines overview (three text buttons); Notes and Updates, whose second row is a search field or filters; the task path in a header of 40 rem or more, where a deep path still cuts its crumbs; the rows of chrome a project's own content adds under the header (Sub-projects, the Columns button).

Advances the ROADMAP item "Shells that feel native" (a tablet reads like an app, `mobile/AUDIT.md`); the web app in a tablet browser gets the same headers.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: two new requirements, "A page header follows its own width" and "A lead line shows whole or not at all".

## Impact

- `web/src/ui/useHeaderRoom.ts` (new): `useNarrow` (an element narrower than the limit) and `useCut` (one line of content wider than its box).
- `web/src/ui/patterns/PageHeader.tsx`: the header measures itself; Help in the menu, the title's flex rule and the lead line.
- `web/src/app/task-list/ListChrome.tsx` (`usePhoneListActions`), `web/src/app/TaskListView.tsx`, `web/src/app/ProjectHeader.tsx`: the phone's slots and menu items in a narrow column.
- `web/src/app/task-detail/TaskPath.tsx`, `TaskPageView.tsx`: the back step.
- `web/src/app/review/StatsView.tsx`: the period button and the export in the header's row.
- `web/src/app/routines/RoutineEditor.tsx`, `web/src/ui/TruncatedText.tsx`: the routine's name.
- No data, op, route or setting changes. No new string. No dependency.
- Screenshots at 768 px of every page with a menu change, and at 1024 px a list beside the docked task panel.
