# Design

## Context

page-rhythm (D3, D4) gave each standalone page a frame of its content width plus the padding, centred in the content column with `mx-auto`. A `useFrameSlide` hook watched the column: when it jumped in width by 160 px or more (the panel docking, the sidebar collapsing), it animated the frame from its old place to its new centre. A layout page kept the 80 rem frame of ux-feedback-2 D7, also `mx-auto`, and re-centred without the slide once the column was wider than 80 rem.

The docked panel is a sibling of the content column in the shell's flex row: from 1024 px it takes its width out of the column. The panel requirement (app-shell, line "From 1024 px the panel SHALL be a 26 rem column, 30 rem from 1440 px") already fixes its width.

## Goals / Non-Goals

**Goals:**
- Opening or closing the docked panel moves no list row and not the title, at any width.
- One left edge for every page: standalone, layout and Settings.

**Non-Goals:**
- Changing the content widths (48, 42 and 72 rem) or where the header's actions sit. The owner dislikes the limited width with the actions at the far top right; that is a separate exploration. This change must not make it worse, and doesn't: the header's actions stay at the frame's right edge as before.
- The panel's entrance animation.

## Decisions

### D1. Both frames start at the column's left edge

The frame's margin is `0` on the left and `auto` on the right (`index.css`, `.page-frame`; `PAGE_FRAME` drops `mx-auto`). The panel takes its width from the right of the column, which is empty space beside a left-aligned frame. Where the column with the panel open is narrower than the frame, the frame narrows from its right side and its left edge stays.

Alternatives considered:
- **Centre the frame in the column minus the panel's room.** The frame is placed as if the panel were already open, and the reserve drops to zero while a panel is docked. It was built and measured: zero movement at every width, and still roughly centred on very wide screens. The owner chose against it: at rest it leaves a wide empty band on the right for a panel that may never open, and it needs a root marker set by the panels in a layout effect, so the mark and the narrower column reach the same paint.
- **Keep centring but reserve the panel's room permanently.** That wastes the space at rest on every screen, and was rejected for the same reason.

The Settings section page has its own 80 rem container with `mx-auto` (the two-column settings layout); it is left-aligned too, so Settings and the lists share the edge. Screens outside the shell keep their own centring: the public list, the display screen, the task page and the cold-start skeleton.

### D2. The slide goes

With no re-centring, the panel never moves the frame. Collapsing the sidebar moves the whole column, so the frame moves with it, as a layout page always did. `frameSlide.ts`, its export and its tests are removed. The page-rhythm reduced-motion behaviour ("the frame is at its new place at once") is moot: nothing moves.

### D3. One width for the docked panel

Measuring the change showed the panel at 26 rem at 1920 px, against the spec's 30 rem from 1440 px. Both panels had `lg:w-[26rem] … min-[1440px]:w-[30rem]`. Tailwind 4 orders breakpoint variants by value, but it cannot compare a px breakpoint with a rem one, so `min-[1440px]` landed before `lg` in the stylesheet and lost.

A custom property, `--panel-w` (26 rem, 30 rem from 1440 px, in `index.css`), now carries the width, and both panels use `lg:w-(--panel-w)`. A unit test pins the values and checks that neither panel goes back to the two utilities.

### D4. Verification

- **e2e.** `scripts/e2e-views.mjs` measures the first visible row and the title with the panel closed, open and closed again, on Today and on a project, at 1280, 1440 and 1920 px. At 2560 px it checks that Today, Labels and a project share one left edge. The project is switched to its list first: an earlier step leaves it on the timeline.
- **Unit tests.** `pageRhythm.test.tsx` checks the frame's margin rule and the panel width.

### Spec note

The live scenario "Centred on a wide screen" keeps its name, because archive refuses to drop a scenario from a MODIFIED requirement. Its text now says the frame is no longer centred.

## Measurements

The first row's x, in px, with the sidebar at its default 16 rem (closed → open; it returns to the closed value on close in every case):

| Width | Page | Before | After |
|---|---|---|---|
| 1024 | Today, Inbox, project | 288 → 288 | 288 → 288 |
| 1280 | Today, Inbox | 384 → 288 (−96) | 288 → 288 |
| 1280 | project | 288 → 288 | 288 → 288 |
| 1440 | Today, Inbox | 464 → 288 (−176) | 288 → 288 |
| 1440 | project | 288 → 288 | 288 → 288 |
| 1920 | Today, Inbox | 704 → 496 (−208) | 288 → 288 |
| 1920 | project | 448 → 288 (−160) | 288 → 288 |
| 2560 | Today, Inbox, project | (not measured before) | 288 → 288 |

## Risks / Trade-offs

- **[Wide screens look emptier on the right]** → Owner's choice: the panel opens into that space. How the page should use a wide screen is the separate exploration named in Non-Goals.
- **[Visual baselines]** → Screens wider than their frame at 1280 px move to the left edge. They are regenerated in the pinned Playwright image.
