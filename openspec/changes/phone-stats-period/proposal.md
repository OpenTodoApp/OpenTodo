# Proposal

## Why

GitHub issue [#1371](https://github.com/OpenTodoApp/OpenTodo/issues/1371), from the interface tour at 360 px:

- **Statistics.** The period choice (This week, This month, This quarter, This year, Last week) wraps onto two rows inside its box, and the "…" menu stands alone on a row under it. The first number starts 219 px down; in German and Italian the choice takes three rows and the first number starts at 267 px.
- **A public list.** The list's name is the page's heading and is cut after one line ("Home renovation with a rather l…"). `phone-row-titles` and `phone-titles-everywhere` gave titles two lines on a phone; this page was missed.
- **A saved view.** The tour also reports the view's name in "Views › name" as cut with no way to read the rest. That name is the title in the shell's phone bar, which `phone-bar-overflow` keeps at one line. What is missing is the full name behind the cut, which every plain title in the bar already has.

## What Changes

- **Statistics: one row under the bar on a phone.** Below 768 px the period is one button that shows the chosen period ("This week") with a chevron and opens the five as a menu, the chosen one checked; the "…" menu ends the same row. The first number moves from 219 px to 109 px at 360 and 390 px (from 267 px in German and Italian). This is what the calendar does with its five views since `phone-calendar-chrome`.
- **A public list's name takes two lines on a phone**, then ends with an ellipsis. A name that is cut, at any width, shows in full on hover and on keyboard focus, and a screen reader reads the whole name.
- **A saved view's name stays one line** in the bar and in the header, and a cut name now shows in full on hover and on keyboard focus, like a plain page title.
- **Nothing changes from 768 px** for Statistics (the radio group of five) or for the public page (one line).

Out of scope: the Statistics header at 768 to 1023 px, where the five options wrap inside their box and the "…" has its own row (see the design's open question); the public page in display mode; the bar's one-line title; a project's name in the bar; and showing a cut name on touch (a tooltip does not open on touch, `touch-no-tooltips`).

Advances the ROADMAP item "Shells that feel native" (the phone reads like an app, `mobile/AUDIT.md`); the web app in a phone browser gets the same pages.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `statistics`: a new requirement, "Period choice on a phone".
- `public-links`: a new requirement, "Public page name on a phone".
- `custom-views`: a new requirement, "A cut view name stays readable".

## Impact

- `web/src/app/review/StatsView.tsx`: `PeriodChooser` is a menu button below 768 px; the header row takes the page's width there.
- `web/src/app/PublicListScreen.tsx`: the heading uses `TruncatedText` with `wrap="phone"`.
- `web/src/app/views/ViewsCrumb.tsx`: the name uses `TruncatedText`.
- Tests in `web/src/app/review/statsView.test.tsx` and `web/src/app/publicList.test.tsx`; `docs/statistics.md`, `docs/public-links.md`, `docs/interface-guide.md`.
- No data, op, route or setting changes. No new string: "Period" and the five period names exist in every language. No dependency.
- The phone-width screenshots of Statistics change; the public list's change where its name is longer than one line.
