# Design

## Context

Below 768 px the shell renders `PhoneBar` from the page-bar store (`setPageBar` in `PageHeader`). It also renders `TabBar` with the floating add button, and the sidebar as a drawer. A list row is its own size container (`@container/row`). Under 40 rem its properties are one muted run under the title (`precision-rows`). The task page (`task-full-page`) shows `TaskFacts` under the notes below 1024 px, in the same headed groups as the desktop column. The briefing (`briefing`) renders in `PageHeader`'s day head, which only exists from 768 px.

The targets are the round-2 mock-ups `phone-today.png` and `phone-task.png`, at 390 × 844.

## Decisions

### D1. The day head stays in the page; the bar loses its title on day pages

- **The day head:**
  - `PageHeader` with `kind="day"` below 768 px no longer gives its title to the bar.
  - It renders the title at the display step, the lead line and the briefing in the page.
  - It is not sticky: it scrolls with the list, so a long day is not paid for in permanent height.
- **The bar:**
  - The store gets a `day` flag. `PhoneBar` then shows the menu button and the page's actions only, with no title, no subtitle and no hairline.
  - The page's `h1` is the day head's, so there is still exactly one level-one heading, and page focus (`pageFocus.tsx`) already prefers `h1[data-page-title]`.
  - Every other page is unchanged: its title and lead line stay in the bar.
- **Back:** a page that declares Back shows it in the menu button's place, as a chevron. A task, or a nested settings page, is a step down, and its way out is Back, not the drawer.
- **Alternative:** a sticky big title, rejected because it takes about 90 px for good on an 844 px screen.

### D2. A phone row is one line with one cell

- **Scope:** CSS only, under `@media (width < 48rem)` combined with `@container row (width < 40rem)`. A narrow list beside other content on a wider screen (the Inbox split) keeps its two lines.
- **The line:**
  - `[data-row-open]` becomes a two-track grid: the title head, then the property column.
  - Every cell is hidden except the one the row marks `data-row-phone`. `phoneCell()` in `TaskRow.tsx` picks it: the date (or zone hint), else the deadline when it holds the third cell, else the assignee, else the project.
  - The project shows as its dot and the assignee as the avatar. Their names stay in the accessible text, using the same visually-hidden rule as the desktop assignee cell.
  - The second line of facts (`data-row-rest`) and the counts are not shown.
- **Height and type:**
  - The open control is the row's 44 px. On touch it already is, so the row's padding is dropped instead of being added to it.
  - The title is 14.5 px (`0.90625rem`), as round 2's density note keeps for phones.
- **The time:** it sits before the title, at its natural width. A row without a time has no empty column. This replaces "the column stays below 640 px" (`Time column`). In the mock-up a day on a phone scans by its times, which lead their rows, and a fixed column costs every untimed row about 60 px of its title.
- **Alternative:** keep the two-line row with a smaller second line, rejected because it halves the tasks per screen.

### D3. Four tabs, a neutral current tab

- **Tabs:** Inbox, Today (a sun, as in the sidebar), Upcoming and Search. More is removed: the bar's menu button opens the same drawer on every page that has the tab bar.
- **Current tab:** the strong text tone, not the accent. The sidebar marks its current page the same way since `precision-shell`.
- **The bar:** sits on the canvas with a soft hairline.
- **Add button:** the floating add button stays. The mock-up leaves it out, but it is the only one-tap way to add on a phone, and quick add's sheet is anchored to it. This is listed for the owner.

### D4. Stacked facts on a phone

- **Layout:**
  - `TaskFacts` takes `stacked`, and `TaskPageView` passes it below 768 px.
  - The facts are one list of 44 px rows in a card, with hairlines between them: the icon and the fact's name on the left, the value or the quiet action right-aligned.
  - The groups' headings are dropped, because the card is short enough to read without them.
- **What shows first (`stackedFirst()`):**
  - every fact with a value;
  - the date and the deadline, as actions while unset;
  - priority only when it is above 4. The default priority is not news on a phone.
- **More:** the rest wait behind "More properties", which shows them in place. Labels are a row when set, or behind More as "Add labels".
- **Unchanged:** every row opens the same editor anchored to it. A viewer still sees text, with unset rows hidden.

## Interface budget

- **Chrome above the first task (Today):**
  - The bar holds no title, so it carries only icons.
  - The day head is the page's header: one title row and at most two lines of briefing.
  - The quick add follows, as before.
  - The rule of at most two rows of chrome counts the bar and the quick add; the day head is the header, as on a desktop.
- **Rows:** at 390 × 844 at least five task rows are visible under a two-line briefing.
- **Properties on a row:** one.
- **Scroll regions:** unchanged.
- **Shortcuts:** none added.

## Data model, size, offline

- No data model change.
- **Bundle:** under 1 kB gzip.
- **Offline:** every element reads local rows, as before.

## Risks

- **Hidden facts on rows:** the labels, the estimate, the start and a blocked mark leave the phone row. The task page has them, and the swipe and menu actions are unchanged. If owners miss labels, a later change can let a view choose the phone cell.
- **No More tab:** people who learned the More tab now use the menu button at the top left, the same control as before `phone-v2`.
