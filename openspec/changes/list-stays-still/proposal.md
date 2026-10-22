# Proposal

## Why

A user who opens tasks in the panel all day wrote: "every time the panel opens, everything jumps a little to the left. It's not enough to really break anything, but enough that it catches my attention each time."

That jump is page-rhythm's page frame at work. A standalone page (Today, Inbox, a label, a filter and so on) is centred in the content column. When the task panel docks as a column, the content column narrows and the frame re-centres, sliding left within the emphasis duration. A layout page (a project) does the same once its 80 rem frame no longer fills the column.

Measured on the current build, with the sidebar at its default width, the first row moves this far when a task opens, and back again when the panel closes:

| Width | Today, Inbox | A project |
|---|---|---|
| 1024 px | 0 | 0 |
| 1280 px | 96 px | 0 |
| 1440 px | 176 px | 0 |
| 1920 px | 208 px | 160 px |

The slide made the move smooth, but the move itself is the problem: the list is what the user is reading, and the panel is meant to open beside it. page-rhythm left this as owner question 1 ("keep the slide at 1280 px, or keep pages still until the window is wide enough"). The owner chose: pages stay left-aligned, and the panel opens into the empty space.

## What Changes

- **Left-aligned frames.** Both page frames start at the content column's left edge, with the same gutter: the standalone frame (its content width plus the padding) and the layout frame (at most 80 rem). So a project, the Inbox and Settings share one left edge at every width.
- **Nothing moves.** The docked panel opens into the space on the right. Opening and closing it (the task panel, or the Plan, Activity and History panels in the same slot) moves no row at any width. Where the column is narrower than the frame with the panel open, the frame narrows from its right side.
- **No slide.** With nothing re-centring, the frame slide (`frameSlide.ts`) goes: there is no jump left to soften. Collapsing the sidebar moves the page by the sidebar's change, as it always has for layout pages.
- **The panel is 30 rem from 1440 px, as specified.** It was 26 rem at every width: the `min-[1440px]:w-[30rem]` utility lost to `lg:w-[26rem]` in Tailwind's order, because px and rem breakpoints don't sort. One custom property, `--panel-w`, now carries the width for both panels.

Out of scope:
- The width of the content columns, and where the header's actions sit. The owner finds the limited width with the actions at the far top right unattractive; that is a separate exploration, and this change keeps both as they are.
- The panel's own entrance (web-app "Overlay motion").
- Phone layouts: below 1024 px the panel covers the list instead of narrowing it.

ROADMAP: a fix to "Next: Design refresh" (page-rhythm); no row changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: "Page template" puts both frames at the column's left edge; opening the panel moves nothing; the slide goes.

## Impact

- `web/src/index.css`: the frame's margin, and the panel's width as `--panel-w`.
- The two docked panels (`TaskDetail`, `PanelFrame`) use `lg:w-(--panel-w)`.
- `web/src/ui/patterns/PageHeader.tsx` and `TaskListView.tsx` lose the slide hook. `frameSlide.ts` is removed.
- The Settings section page's own container no longer centres itself.
- `scripts/e2e-views.mjs` measures the first row and the title with the panel closed, open and closed again at 1280, 1440 and 1920 px, and checks one left edge at 2560 px.
- Docs (`docs/interface-guide.md`) and the CHANGELOG.

No dependency, no environment variable, no sync change; the bundle shrinks by the slide hook.
