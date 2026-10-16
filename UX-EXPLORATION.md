# UX exploration, October 2026: the task panel and the sidebar

The ux-overhaul programme fixed the scroll model, the page template and the vocabulary, and the app feels lighter for it. Two places still do not: the task panel's properties, which read as a dense bag of chips with controls floating between them, and the left sidebar, which puts the filters, the project tree and the labels into one scroller that cannot show them all once there are more than a handful. This document explores both, with evidence from a seeded build, and proposes what to do. It is written to be turned into OpenSpec changes; section 5 names them.

## 1. How this exploration was made

- **The running app**: a fresh build (`make web`, `go build`) seeded over the REST API with 30 nested projects in 11 top-level groups, 12 labels, 6 pinned filters, and one task with every property set (due with a time, a start date, a deadline, an estimate, a repeat rule, two reminders, three labels, an assignee, a blocker, three subtasks, an attachment and two comments). Captured at 1280×800, 1440×900 and 390×844 in light and dark, and measured with the DOM.
- **Code**: `web/src/app/task-detail/` (`TaskDetail.tsx`, `Properties.tsx`, `PropertyChip.tsx`, `WhenControl.tsx`, `ZoneControl.tsx`, `ConversationTabs.tsx`), `web/src/app/Sidebar.tsx`, `web/src/ui/patterns/Sidebar.tsx`, `sidebarLayout.ts`, `index.css`, the live specs `app-shell` and `web-app`, the archived designs of `task-detail-redesign` and `ux-overhaul`, and `UX-AUDIT.md`, whose items C1 to C12 and A2, A3, A7 this document builds on.
- **Not done**: user testing, and anything outside these two regions.

## 2. What the measurements say

| Measure (1280×800 unless noted) | Today | Where it hurts |
|---|---|---|
| Sidebar scroller: visible height / content height | 384 px / 1888 px | one fifth of the groups fits; the user scrolls five screens of sidebar |
| Projects visible inside the scroller without scrolling | 1 of 30 | six pinned filters (254 px) sit above the tree |
| Position of the Labels group | 1362 px below the top of the scroller | labels are never seen unless the tree is scrolled to its end |
| Phone drawer (390×844): visible / content | 428 px / 1888 px | same, worse |
| Panel width | 416 px (26 rem) | 480 px from 1440 px |
| Panel content / visible height (full task) | 1099 px / 610 px | two screens, before any comment is read |
| Properties block height | 302 px, 7 wrapped lines | 12 chips, 4 orphan "clear" buttons, 18 buttons in all |
| The When editor when opened from the Do on chip | 817 px tall, 22 controls | taller than the panel; opens inline and pushes everything below it down |
| Comment composer pinned at the bottom | 133 px | 22% of the visible panel, shown for every task, empty or not |
| Task with long notes: top of the properties | 1351 px (viewport 800 px) | the facts of the task are a screen and a half below its title |

## 3. The task panel

### 3.1 Why it reads as dense

The chips were the right move away from the thirteen-row form (`ux-overhaul` D4): what is set is shown, what is not is offered. The density comes from how the chips are composed, not from the idea.

1. **Every property has the same shape, so nothing has structure.** Twelve chips of equal weight wrap wherever the width breaks them. On the seeded task the second line reads "Sat, Oct 17 · 09:00 · Floating · P2", the third "Sun, Oct 25 in 9 days ×", the fourth "Starts Wed, Oct 14 × · 2 reminders". Three dates in three formats, and only a 12 px icon says which is the plan, which is the deadline and which is the start. The list row above it says "Tomorrow 09:00 · repeats · 9d" for the same facts in the metadata language of `task-list-presentation`; the panel does not use that language.
2. **Controls float between values.** The "clear" buttons are separate 24 px targets after the chip (`PropertyChip.tsx`, `onClear`), so the row reads "value × value ×". The zone control is a bordered chip ("Floating") beside the due chip, rendered with the button style, so it reads as a selected toggle and as a value of its own; and on a date without a time it adds a line of hint text ("Set a time to fix this due to a time zone") to every dated task.
3. **Editors open inline and push the panel.** A chip's editor renders as a full-width box in the chip row (`basis-full`). The When control stacks all six segments (Do on, Start, Deadline, Evening, Repeat, Reminders) in one 817 px box with native date inputs ("10/17/2026"), its own second zone chip and its own "×" under the date. Opening it to change the deadline shows five other editors first.
4. **The composer costs a fifth of the panel at rest.** The textarea, the Comment button, the attach button and "Send with Ctrl+Enter" are pinned at the bottom (`web-app` "Task panel comment composer") whether or not there is anything to say; 133 px on every task.
5. **Notes come before the facts.** The order (notes, breadcrumb, chips) is right for a short note and wrong for a long one: on the seeded "architecture note" task the properties start 1351 px down. The list row shows the task's dates and labels at a glance; its panel hides them.
6. **Four stubs where one line would do.** Subtasks and Attachments each carry a heading, a count and an add line; the header truncates the title ("Prepare the quarterly repor") while showing a 0/3 badge that the Subtasks heading repeats.
7. **The Add menu is one flat list** of up to eleven properties with a single separator before Blocked by.

### 3.2 Directions explored

**A. Facet lines (recommended).** Group the properties into four fixed facets, each one line with a leading icon and a sentence-like value whose parts are separate buttons:

| Facet | Icon | Reads as | Opens |
|---|---|---|---|
| Where | folder | `Website launch › Doing` · `under Prepare the report` for a subtask | the project, section and parent pickers |
| When | calendar | `Tomorrow 09:00 · every 3 months · deadline Sun 25 Oct, 9 days · from Wed 14 Oct · 2 reminders` (`· evening`, `· New York` as suffixes when set) | the When control, on the segment that was clicked |
| How | flag | `P2 · 2 h · finance, deck, deep-work` | priority, estimate, labels |
| Who | users | `You · waits for Collect the numbers · blocks 2` | assignee, blocked by, blocks |

A facet with nothing set is not shown; Where and When are always shown (When reads "Not scheduled" when empty, in place of today's "Do on" placeholder chip). One Add menu remains, grouped under the four facet names. Each part uses the words the list row already uses ("Tomorrow 09:00", "repeats", "9d" expands to "deadline in 9 days"), so the list and the panel tell the same story. On the seeded task the properties go from 302 px in 7 lines to about 140 px in 4 lines, with 12 values still visible. Keyboard: a facet is a tab stop, Left and Right move between its parts, Enter opens the editor of the part, `1` to `4` keep setting priority.

*Why not keep the chips and only reorder them?* Order helps, shape does not: twelve bordered boxes of one weight stay a bag. A facet line is a sentence with one subject, which is how people say it ("tomorrow at nine, deadline in nine days").

**B. Key/value rail.** A label column and a value column, one row per property (Linear, Notion). Scannable and familiar, but one line per property brings back ten lines for a full task, and it is the form look `ux-overhaul` left. Rejected for the panel; see D for the page.

**C. Editors as anchored popovers, not inline boxes (recommended, with A).** `Popover` already places a panel next to its trigger from 640 px and as a bottom sheet below. The When control becomes a popover with a segmented header (Do on · Start · Deadline · Repeat · Reminders) showing one segment at a time; the part that was clicked chooses the segment; Evening and the zone live inside Do on. Every popover shares a footer with Clear and Done, which removes the orphan "×" buttons. The panel's layout never moves while editing. This is audit item C12, still open.

**D. Two-column task page.** The page variant (`/task/<id>`, max-w-3xl today) keeps the panel's facets but places them in a 16 rem rail beside the notes and conversation from 1024 px; below that it stacks as the panel does. Long notes and long threads get the width they need; the panel stays one column. Recommended, as a second change.

**E. The When line as a natural-language field (future).** The When facet is also a text field: press Enter on it and type "next friday 3pm every week, deadline end of month"; the quick-add parser (`nlp-quick-add`, six languages) fills the segments, and the popover shows what it understood before it is committed. Keyboard-first and on brand; it depends on A and C and on the parser gaining deadline and start phrases, so it is listed as a follow-up and not in the first change.

**F. Clamp long notes.** In the panel, notes that are not being edited show at most about eight lines with a quiet "Show all" line; focusing them expands them, and the page variant never clamps. Keeps notes first (the overhaul's order) without burying the facts. Recommended, with A.

**G. A one-line composer.** The pinned composer rests as one 40 px line ("Write a comment…") and expands to the full composer with attach and send when focused or when `Shift+C` is pressed. Still pinned, still reachable without scrolling, 90 px returned to the content. Recommended, with A.

**H. Panel density follows the preference.** `data-density="compact"` already tightens rows and sidebar items; it should also tighten the facet lines and the subtasks list. Small, with A.

### 3.3 The recommended panel, top to bottom

1. Sticky header: checkbox, title wrapping to two lines (today it truncates), menu, close. The subtasks badge leaves the header; the Subtasks heading already carries the count.
2. Notes, clamped at rest (F).
3. Four facet lines (A) and one grouped Add menu; editors as popovers (C). The zone is a suffix of the Do on part and a segment of its popover; the hint text goes.
4. Subtasks as the checklist it is today, with the add line; Attachments as a list only when there are any, "Attach" in the header menu and by paste or drop (audit C7, still showing a button in the empty state).
5. Comments, Activity and History tabs, and the one-line composer (G).

Interface budget: four facets at rest for any task (two for an empty one), so visible properties stay under seven; the number of scrollers does not change, because popovers are overlays and the long-notes clamp is not a scroller.

Specs touched: `web-app` "Task panel layout" (the order and the clamp), "Task panel property chips" (replaced by "Task panel facets"), "Task panel comment composer" (the resting line); `docs/interface-guide.md` "The task panel"; the words in `docs/notes-and-subtasks.md` and the task panel Help page; `budget.test.tsx` counts facets.

## 4. The sidebar

### 4.1 Why it is hard to use when it is full

The one-scroller model (`ux-overhaul` D2) was right: nothing nests, and the footer is always there. What remains is that the scroller has 384 px for content that is 1888 px tall, in a fixed order that does not match how the groups are used.

1. **Filters come first and are never collapsed.** Six pinned filters cost 254 px before the first project. Filters are a power feature; projects are navigation. The group is not collapsible and has no count.
2. **The tree is expanded by default.** Thirty projects in eleven roots render as thirty rows. Collapse state exists per project, but nothing collapses the tree or remembers a "roots only" view.
3. **Labels are at the bottom of everything.** The group is collapsible, but it sits under the tree, so it is 1362 px down. On the phone drawer it is five screens down.
4. **Nothing says where you are.** Group headers scroll away with their content; after two screens of projects the user sees rows with dots and no heading.
5. **Finding is by scrolling.** There is no way to filter the sidebar by typing, and the tree does not have the type-ahead that the ARIA tree pattern expects. The command palette finds projects, but it is a different place and closes the sidebar on the phone.
6. **Width is adjustable, height is not.** The resizer (15 to 22.5 rem) helps long names, not long lists. Compact density gives 32 px rows instead of 36, which is 12% more rows, and is the only lever today.

### 4.2 Directions explored

**A. Accordion groups with sticky headers (recommended, first).** Every group (Filters, Projects, Labels) is collapsible, remembered per device, with its count on the header while collapsed ("Projects 30"). Headers are `position: sticky` inside the scroller, on the canvas colour, so the current group is always named and one click from closing. Two groups collapsed leave the third the whole scroller. Cost: CSS and two booleans; `SidebarGroup` already has the chevron.

**B. Collapse the tree by default, and "Collapse all".** New devices see the roots only (11 rows); the Projects header menu gets Collapse all and Expand all; Alt+click on a chevron collapses the siblings. Navigating into a sub-project still reveals it (today's behaviour). With A, a full account fits: 11 roots in 396 px.

**C. Favourites, one pin for everything (recommended, second).** A Favourites group at the top of the scroller holds pinned projects, labels and filters, mixed, in the user's order. "Pin to sidebar" appears in every project, label and filter menu. The Filters group then lists all saved filters (today it lists the pinned ones, so "pinned" and "listed" are the same thing), and Labels lists all labels. Favourites are personal, projects can be shared, so the list is a synced preference like the promoted destinations (`appearance.sidebar`): a `favorites: [{ kind, id }]` list, additive, unknown kinds ignored; `view.pinned` keeps working and is mirrored into it. Things' sidebar and Todoist's Favourites are the references.

**D. All projects, as a page.** Filters and Labels have an "All" page; Projects does not. A `/projects` page lists every project as a tree with counts, archived ones behind a disclosure, a search field, and new-project and template actions. With C, the sidebar can show Favourites and a collapsed tree and still put every project one click away. The archived-projects list in Settings moves here.

**E. Find as you type.** A filter field at the top of the scroller, shown on a search action in the Projects header and on typing while a sidebar row is focused: it narrows projects (keeping ancestors), labels and filters together, Escape clears. The tree also gets ARIA type-ahead (typing "ho" moves focus to Home). Mobile benefits most: the drawer is 428 px tall. A registered shortcut with no conflict is required by the budget; `g` keys are taken, so a chord such as `g /` or no shortcut at all.

**F. One group at a time.** A segmented control (Projects · Labels · Filters) at the top of the scroller shows one group with the full height; counts on the segments. Clean, and the best use of a short drawer, but labels and filters are a click further and the segmented control is a third kind of sidebar chrome. Not recommended as the default; A with everything collapsible reaches the same state when two groups are closed.

**G. Recents.** A Recent group with the last five projects opened. Useful on accounts with many projects, but it moves under the user's feet; Favourites (C) gives the same with the user in control. Not recommended.

**H. Sections as areas.** Promote top-level projects to visual "areas" with their children listed flat under them (Things). Changes nothing in the data (it is the tree with one level of styling) and reads well for people who use roots as areas, but doubles the row styles. Set aside; B gives the same first screen.

**I. The phone drawer.** A and E apply to the drawer as they are. The drawer is 85vw today; with sticky headers and collapsed groups its first screen shows the primary destinations, Favourites and the group headers.

### 4.3 The recommended sidebar, top to bottom

1. Pinned top: name, the five primary destinations, More (unchanged).
2. Scroller, one list: Favourites (C, when any), Projects (A, B, with a header menu holding New, From a template, Collapse all, Expand all, All projects), Labels (A), Filters (A). Headers sticky.
3. Pinned footer (unchanged).

Interface budget: primary destinations stay at five plus More; the scroller count does not change; the one new shortcut (E) is registered through the registry.

Specs touched: `app-shell` "Sidebar structure" (the groups' order, collapsibility, Favourites, sticky headers), `custom-views` (what "pinned" means once Favourites exist), `project-organization` (All projects page, pin), `appearance-preferences` (the favourites list), `labels` (pin). The Help pages for the sidebar and projects follow.

## 5. Proposed OpenSpec changes

In this order; the first two are independent of each other.

| # | Change | Items | Effort | Notes |
|---|---|---|---|---|
| 1 | `sidebar-groups` | 4.2 A, B, E, compact rows | S to M | No data change. The sticky headers, collapsible Projects and Filters, roots collapsed by default on a new device, Collapse all, find as you type, tree type-ahead. |
| 2 | `task-panel-facets` | 3.2 A, C, F, G, H, the header title wrap, C7's Attach | L | No op change. Replaces `Properties.tsx` chips with `Facets.tsx`; every popover reuses the editors that exist (`DueField`, `DateField`, `RecurrenceField`, `RemindersField`, `EstimateField`, the pickers). Stories for every facet state; the baselines of `Task/Panel` and `Screens/Shell` are regenerated. |
| 3 | `sidebar-favourites` | 4.2 C, D | M | Additive `favorites` preference; `/projects` page; "Pin to sidebar" in three menus; Settings → Projects keeps its archived list or links here. |
| 4 | `task-page-columns` | 3.2 D | M | The page variant only. |
| 5 | `when-line-capture` | 3.2 E | M | After 2; needs parser phrases for start and deadline. |

Size: no new dependency in any of them. Change 2 is the only one that touches more than two files of `web/src/app`.

## 6. Small things that ride change 2 without a design of their own

- The title in the panel header wraps to two lines instead of truncating.
- The zone chip stops rendering with the button style; it becomes a suffix and a popover segment.
- The deadline reads "deadline" and the start reads "from" or "since" (a start date in the past reads "since Wed 14 Oct", not "Starts Wed, Oct 14").
- "Collect the numbers from finance" as a blocker reads "waits for Collect the numbers from finance"; a lock icon alone does not say it.
- The Add menu is grouped by facet.

## 7. Open questions

1. Should the Favourites group replace the Filters group entirely (a saved filter that is not pinned is reachable from All), or keep both? The recommendation keeps both, with Filters collapsed by default once Favourites exist.
2. Should "roots collapsed by default" apply to existing devices once (a one-time migration of the collapsed set) or only to new ones? The recommendation is new devices only, with Collapse all one click away.
3. Is "Who" the right name for the fourth facet when it holds dependencies as well as the assignee? "People and dependencies" is accurate and long; the icon and the parts carry most of the meaning, so the name is only announced to screen readers.
