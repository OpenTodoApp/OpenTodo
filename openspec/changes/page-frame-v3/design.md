# Design

## Context

page-rhythm D3 gave pages two frames: a standalone frame (content width plus padding) and an 80 rem layout frame for pages with a layout switch. list-stays-still moved both to the column's left edge. Since ux-feedback-2 D7, the header has spanned the frame while the content took the page type's width (`index.css`, `.page-frame[data-page-body=…] > :not([data-page-header])`), so on a layout page the header was wider than the list. The list width (48 rem) dates from before the left alignment, when it sat centred.

## Goals / Non-Goals

**Goals:** the title and the actions line up with the content's edges; list pages use more of a wide screen; a project's header never moves between its layouts.

**Non-goals:** changing row anatomy; phone layouts; saved views' board and timeline frame.

## Decisions

### D1. The header takes the content width

Every child of a page frame, the header included, takes the page type's width (`--page-width`): 60 rem for lists, 42 rem for forms, 72 rem for a list with field columns or a project's list. A `full` page (boards, timelines, calendars) has no content width, so its header spans the frame. A sticky header bleeds into the side padding (`-mx-4`, `-mx-8` from 768 px) and pads it back, so its box is the content width plus that bleed (2 rem, then 4 rem). Its title and actions then sit exactly over the content.

### D2. A project's frame is 72 rem in every layout

Capping the header at the content width alone would give a project's list a 72 rem header and its board an 80 rem one. The List/Board/Timeline switch sits in that header, so it would jump sideways under the pointer when clicked. Instead a project's frame (`data-page-project`) is 72 rem in all three layouts. The header has one width, the switch never moves, and a board with more columns than fit scrolls sideways inside the frame, as boards already do. Calendars keep the 80 rem layout frame.

Rejected: a project's list at 60 rem like the other lists. It looks less stretched with short titles, but the switch would jump 320 px between List and Board. A 72 rem board shows four 280 px columns before scrolling, which covers most projects.

### D3. Lists at 60 rem

At 1920 px with the default sidebar, the content column is about 104 rem. A 60 rem list uses a little over half of it, with room for the docked 30 rem panel beside it without narrowing the list. At 1280 px the column is 64 rem, so the list fills it as before; at 1440 px it fills 60 of 74 rem. Row anatomy is unchanged: the title takes the extra room, and the trailing counts and actions stay at the right edge, which is also the header's right edge now (D1).

### D4. Verification

`scripts/e2e-views.mjs` checks at 1920 and 2560 px that the header's actions end at the content's right edge (within 2 px) on the Inbox, Today and a project's list and board. It also keeps list-stays-still's checks (opening a task moves nothing; one left edge). `pageRhythm.test.tsx` pins the 60 rem width and the header rules.

## Measurements

Header actions' right edge against the content's right edge (px, 1920 × 900, sidebar at its default width, panel closed). "After" is measured with `.page-frame` geometry in Playwright on the seeded account; "before" is read from screenshots of main at `685d3de8` (±4 px):

| Page | Before | After |
|---|---|---|
| Inbox | 1056 / 1056, list 768 px wide | 1248 / 1248, list 960 px wide |
| Today | 1056 / 1056 | 1248 / 1248 |
| A project, list | 1568 / 1440 (128 px past the rows) | 1440 / 1440 |
| A project, board | 1568 / 1568 | 1440 / 1440 |

## Risks / Trade-offs

- Wider lists put a short title further from its trailing counts. The counts stay quiet (faint tone), and the alternative was a narrow column on an empty page.
- A project with five or more sections now scrolls its board sideways at 1920 px where it didn't before (four 280 px columns fit in 72 rem, five fitted in 80 rem).
- Owner question: lists at 60 rem, or narrower or wider? It is one custom property (`--page-width` for `list`).
