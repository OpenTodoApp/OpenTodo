# Design

## Context

`StatsView` gives `PageHeader` its second row (`children`): `PeriodChooser`, a `radiogroup` of five buttons in a bordered box that wraps, and the "…" menu with Export time entries. Below 768 px (`DESKTOP_HEADER_QUERY`) the title is in the shell's bar and this row is the first thing in the page.

Measured on the built app with the layout check's seed, Chromium with touch, 360 × 740 px: the five options do not fit 328 px, so the box is two rows of 44 px (three in German and Italian), the "…" wraps under it, and the tiles start at y = 219 (267 in German and Italian). The same at 390 px.

The public page (`PublicListScreen`) draws its own heading: a colour dot and an `h1` with `truncate`. A saved view's title is `ViewsCrumb`, a node, so `PageHeader` and the bar place it as it is, and its name was a bare `span` with `truncate`.

## Goals / Non-Goals

**Goals:** one row under the bar on Statistics at 360 px in every language; every period one tap and one choice away, by touch and by keyboard; the public list's name readable on a phone; no new string, no new component; nothing different from 768 px.

**Non-Goals:** a new control in the design system; changing the bar's one-line title; the Statistics header between 768 and 1023 px.

## Decisions

### D1. The period is a menu button, as the calendar's view is

Two patterns exist for "one of five" that does not fit a phone's row:

- **One button with the chosen name, opening a menu (chosen).** `phone-calendar-chrome` did this for Day, Week, Month, Plan and Year: the overlay `Menu` with `kind="menu"` and radio items, a bottom sheet on a phone titled with the group's name. The row is the button (105 px in English, 122 px in German, 148 px in Italian) and the "…" at the other end, in a 328 px column. The chosen period is always named in the row.
- **Let the five scroll sideways.** `Tabs` scrolls its row inside itself, with a fade. Rejected: these are not tabs (the period is a filter on one page, a `radiogroup`), "Last week" would sit off screen at 360 px in every language with only a fade to say so, and the "…" would still need its place. Two screens that each choose one of five in the row under the bar should not do it two ways.

The cost is one more tap to change the period on a phone. The stored period is unchanged (`ot.stats.period`, a device convenience).

### D2. One component decides, by the header's own breakpoint

`PeriodChooser` reads `useMediaQuery(DESKTOP_HEADER_QUERY)`, the condition under which `PageHeader` moves the title to the bar: from 768 px the radio group, below it the menu button. The button is a ghost button like the calendar's; its accessible name is "Period" (visually hidden) followed by the period it shows, and the items are `menuitemradio` with the chosen one checked. It stays the first focusable control of the page, before the "…" (statistics "Statistics screen", "Time entries export"). Below 768 px the row takes the page's width, so the "…" ends it at the column's edge, under the bar's own menu position; from 768 px the row keeps its content's width.

### D3. The public list's name uses `TruncatedText wrap="phone"`

The heading becomes `TruncatedText as="h1" wrap="phone"`: `.title-phone` gives two lines below 768 px and one line from there, and `TruncatedText` gives a cut name its full text in the tooltip on hover and keyboard focus, with the element in the Tab order only while it is cut. The element's text is the whole name, so a screen reader reads it all. Below 768 px the header aligns on the baseline so the colour dot stays on the name's first line; from 768 px it stays centred. Show full task titles does not apply: a guest has no preferences.

### D4. A view's name: one line, full text behind it

The reported `span` is the last part of `ViewsCrumb`, shown in the phone bar's `h1` below 768 px and in the page header from there. It is the bar's title, so it stays one line (`phone-bar-overflow`, `phone-header-room`). It now uses `TruncatedText` without `wrap`, as `PhoneTitle` does for a plain string title: the tooltip on hover and keyboard focus, a Tab stop only while cut. On touch nothing opens; the full name is in the sidebar, the Views overview and the view's menu ("Menu for view …").

### Data model, size

No data model impact: no field, op, route or setting. No dependency. `Menu`, `MenuItem`, `TruncatedText` and `useMediaQuery` are already in the first load; the Statistics chunk and the public page grow by a few hundred bytes.

### Interface budget

Statistics on a phone goes from three or four rows before the first number to two (the bar and one row). No new destination, scroll region, task property or shortcut. The public page's heading may take a second line; it is content, not chrome.

## Risks / Trade-offs

- Changing the period takes two taps on a phone.
- A public list with a long name starts 28 px lower on a phone.
- A cut name on touch has no tooltip; this is the same for every cut page title.

## Open Questions

- Between 768 and 1023 px the Statistics options wrap to two rows in their box and the "…" has a third (tiles at y = 186 at 768 px). The menu button could serve up to 1024 px, but the header's breakpoint is 768 px and the issue is the phone. Left as it is.
