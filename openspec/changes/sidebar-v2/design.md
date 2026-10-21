# Design

## Context

See proposal.md for the motivation. Relevant current state:

- The sidebar is composed in `web/src/app/Sidebar.tsx` (656 lines) from the primitives in `web/src/ui/patterns/Sidebar.tsx`: `SidebarItem` (ACTIVE = accent-soft pill with `text-on-accent-soft`; IDLE = `text-muted`, hover `bg-sunken`), `SidebarGroup` (sticky header, `text-hint font-semibold uppercase tracking-wide text-faint`, background `bg-canvas`, actions always visible), `SidebarGroupAction`, `StatusDot`. The footer is `web/src/app/SidebarFooter.tsx`; the running entry is `TrackingIndicator`, rendered above the footer row with `mb-1`, so a running entry adds a second line.
- The header row is `<img src="/favicon.svg">` plus the name and the search button; the sign-in screen uses the same image. The favicon is a tick on a slate rounded square; `pwa-192.png`, `pwa-512.png`, `apple-touch-icon.png` and `extension/icons/icon-{16,48,128}.png` are hand-exported copies with no source of truth and no test.
- Tokens: text tones are `text-strong`, `text-default`, `text-muted`, `text-faint`; `muted` (#526075) and `faint` (#5f6e82) are almost the same in light, which is why nothing in the sidebar reads as quiet. `tokens-v2` (a sibling change of this batch) retunes the scale into clear steps and names the step below `muted` the quiet tone. `color-mix(in oklab, …)` is already used for the chart ramp and the selected row, so a mixed surface token is in the house style; `src/ui/tokens/pairs.ts` lists every text-on-surface pair the contrast test measures.
- Open changes that touch the sidebar and are being archived now: `quiet-sidebar` (counts on hover, the one-row footer, "Quiet markers in the sidebar" with the review-due dot on More, the bell marker), `sidebar-favourites` (the Favourites group), `ux-feedback-2` (the sub-project guide line and drops on the sidebar), `time-tracking` (the running indicator), `lean-chrome`. The merged `workspaces` change will replace the header's left part with the workspace control.
- The interface budget allows six primary destinations and counts the footer as one row.

## Goals / Non-Goals

**Goals:**
- A sidebar that is quieter than the content and shows its controls when wanted, with every tone still meeting AA.
- One brand mark with one source and generated assets, so the app, the extension and the website can never drift apart.
- The footer stays one row in every state.
- Every change lands against the text the open sidebar changes leave behind, with no requirement modified twice.

**Non-Goals:**
- Changing which destinations are primary, the six-destination budget, the More menu's contents or the Favourites rules.
- The drawer's structure, the phone tab bar, or touch gestures (`phone-v2`).
- The tone scale's values (`tokens-v2`); this change consumes the scale and falls back to today's tokens if it lands first.
- An animated or seasonal mark, a settings switch for the tint, or a mark redesign process involving outside designers (the brief below is the design; the mark is drawn in the implementation and judged by the acceptance criteria).

## Decisions

**D1. The header row is a slot.** `Sidebar.tsx` renders `<SidebarHeader left={<Brand />} search={…} />`; `left` is the one prop `workspaces` later fills with its control. The search button, the `data-palette-button` hook and the rail behaviour live in `SidebarHeader`, so the workspace change touches one prop. Alternative: let `workspaces` rewrite the header. Rejected: two changes editing the same twenty lines in the same quarter.

**D2. The brand brief.** Motif: an open loop (a circle open at the top right) whose free end turns down and becomes the short stroke of a tick, so the shape reads "a loop closing" at a glance and as a tick at 16 px. Geometry: 24-unit grid, 2-unit stroke, round caps and joins, the loop centred at (12, 13) with radius 8, the tick's long stroke ending at (20, 7); the opening is 70° so the two ends never touch at 16 px. Mono variant: stroke `currentColor`, the closing segment (from the loop's end to the tick's apex) in `var(--ot-accent-text)`, so the mark takes the sidebar's tone and the accent of the current theme. Colour variant: a 64-unit rounded square (radius 14, fill slate #0f172a in every theme, since it sits on other people's surfaces, not ours) with the stroke in emerald #34d399 and the closing segment in white, inside the maskable safe zone (the inner 80 %). Wordmark: "OpenTodo" in the bundled Inter at the body size, weight 600, strong tone; it is text, not a path, so it translates nothing and renders with the page. Sizes: 16 (chips, tooltips, favicon fallback), 20 (dialog titles), 24 (sidebar header, rail), 32 (sign-in and account screens). Acceptance criteria are the scenarios of "Brand mark"; the 16 px legibility check is a workbench story at 16 px with a baseline in both themes, reviewed once by eye and then frozen. Alternatives: a tick alone (what we have, generic), a letter O with a tick (reads as "OK"), a filled circle with a cut tick (a checkbox). Rejected for the reasons in brackets.

**D3. One source, generated rasters.** `web/src/ui/icons/brand.svg` is the source; `BrandMark` and `BrandWordmark` in `web/src/ui/icons/Brand.tsx` inline it. `scripts/brand-icons.mjs` renders the colour variant to every raster (favicon fallback is the SVG itself; `pwa-192.png`, `pwa-512.png`, `pwa-maskable-512.png`, `apple-touch-icon.png`, `extension/icons/icon-{16,48,128}.png`, `brand/icon-512.png` for the bundle) in the bundled Chromium, the way `make docs-screenshots` already renders pages, so there is no new dependency. `scripts/brand-icons.test.mjs` re-renders and compares bytes, failing when a raster is stale. The manifest keeps today's paths so installed apps update by content, and gains the maskable entry (`purpose: maskable`). Alternative: `sharp` or `resvg` as a dev dependency. Rejected: the Chromium path exists and the rule is to justify every dependency.

**D4. Tone table.** The step names are `tokens-v2`'s; the right column is the fallback if this change lands first.

| Element | Rest | Hover or focus | Active | Fallback tokens today |
| --- | --- | --- | --- | --- |
| Destination, project, label, filter label | quiet | default on `bg-sunken` (`bg-raised` in dark) | strong on `bg-accent-soft` | `text-faint` → `text-default` → `text-on-accent-soft` |
| Row icon | quiet | default | accent | `text-faint` → `text-default` → `text-accent` |
| Count | quiet, tabular | quiet | quiet | `text-faint` |
| Group header label and chevron | quiet, hint size, uppercase | default | n/a | `text-faint` → `text-muted` |
| Group controls | hidden (fine pointer) | default | accent while active (All in a view) | as today |
| Wordmark | strong | n/a | n/a | `text-strong` |
| Mark (mono) | current text tone, loop end in accent | follows the text | n/a | |
| Footer icon buttons | quiet | default | current: accent-soft pill | `text-muted` → `text-default` |
| Running pill | `bg-accent-soft`, time in strong tabular, title in `text-on-accent-soft` | title default | n/a | |

Every pair is added to `pairs.ts` against the new sidebar surface token (D8) in both themes and the high-contrast override, so the contrast test guards them. The quiet tone must reach 4.5:1 on the tinted surface; `tokens-v2` sets it with that pair in mind, and the fallback `text-faint` already does.

**D5. Hidden controls that stay in the document.** The group's actions get the existing `ui-count-quiet` treatment generalised into `ui-reveal`: `opacity: 0` at rest, `opacity: 1` inside `:hover`, `:focus-within` and on `(pointer: coarse)`, transition `--duration-ui`. They are never `display: none` or `visibility: hidden`, so the Tab order, the accessible tree and the layout never change and a focused control is always visible (WCAG 2.4.11). The header's accessible name gains the count ("Projects, 12 items") through visually hidden text, as rows already carry theirs. Alternative: render the controls only on hover. Rejected: keyboard users would never find them and the header would reflow.

**D6. The footer pill.** `TrackingIndicator` is removed from above the row; `SidebarFooter` renders `<RunningPill />` in the place of the account name while an entry runs, inside the same flex row, and the account `Menu` keeps its `label` (the person's name) so the menu is still named by the person. The pill is a group of two controls: the pill body (opens the task, name "Tracking 1:05 · Write the report") and a small Stop icon button inside it; both are 32 px high with a fine pointer and keep the touch height below 768 px. The `Announcer` is kept as is. On the rail the pill is the elapsed time, 32 px wide, with the title and Stop in its tooltip and a menu on activation, as today. Alternatives: keep the second line (breaks the one-row footer and shifts the scroller by 36 px whenever tracking starts); put the pill into the page header (the header budget is two visible actions and the pill would compete with them). The phone bar's pill (`time-tracking`, below 768 px) is unchanged.

**D7. More as a group label, and where the marker goes.** On a fine pointer from 768 px More stays a menu-opening row (`quiet-sidebar`), but its render becomes the group-header style: `SidebarGroup`'s heading button with `aria-haspopup="menu"`, label "More" at the hint size uppercase and a `chevron-right`, no icon, `aria-current` while a More destination is open. On a coarse pointer it is the inline collapsible group as today. It carries no marker: the review-due dot moves to the Review entry (the `StatusDot` and tooltip text are reused), inside the More menu or group in Lists only and Companion, and on the primary Review destination in Open Loops first. Trade-off accepted: in Lists only and Companion a due review is no longer visible while More is closed; the Loop home and the Daily check already say "Weekly review due" in Companion, and Lists only hides method words by the user's choice. The Updates badge moves to the Updates item for the same reason. Alternative: a text line "Review due" on the More header. Rejected: a header that changes its text is what made the dot cryptic in the first place. Alternative: a derived "review due" notification on the bell. Rejected: the bell marker reads the notification cache and writes nothing; a derived entry would need a second source of truth.

**D8. The sidebar surface token.** `--ot-sidebar: color-mix(in oklab, var(--ot-accent) 3%, var(--ot-canvas))` in light, 4 % in dark, mapped to `bg-sidebar`; the high-contrast blocks set it to `var(--ot-canvas)`. `Shell` applies it to the sidebar column from 768 px with a fine pointer; the drawer keeps `bg-surface`. `SidebarGroup`'s sticky header switches from `bg-canvas` to `bg-sidebar`. The percentages were chosen so that the tint is visible side by side with the canvas and invisible in isolation; both are stated in the spec so a change is a spec edit. The tint follows the accent themes of `theming` because it mixes the live accent token. Alternatives: a translucent sidebar over content (Liquid Glass): rejected by the proposal for legibility; a fixed hex per theme: rejected, eight themes would need sixteen values that drift.

**D9. The rail and the drawer.** Both consume the same `SidebarItem` and `SidebarGroup`, so the tones apply by construction; the rail shows the mark alone in the header and the time alone in the footer. The drawer's structure is `phone-v2`'s; this change only guarantees its tones and that it keeps `bg-surface`.

**D10. Spec placement against the open changes.** "Sidebar structure" is modified by `quiet-sidebar`, `sidebar-favourites` and `workspaces`, so this change adds requirements beside it instead of modifying it. "Quiet markers in the sidebar" is added by `quiet-sidebar` and contradicts D7 in one sentence ("The rhythm marker on More and on the Review entry SHALL be such a dot") and one scenario ("Review due on More"). Modifying a requirement that is not yet in the main spec would fail at archive, so task 7.2 edits `openspec/specs/app-shell/spec.md` directly after `quiet-sidebar` is archived: the sentence becomes "The rhythm marker on the Review entry SHALL be such a dot" and the scenario is replaced by "More is a labelled group"'s desktop scenario. `time-tracking`'s "Running indicator" is satisfied by the pill as written (elapsed, title, Stop, opens the task), so it is not modified. The bundle folder is additive, which "Stable bundle layout" allows with a documented path.

**D11. Interface budget.** No new chrome row: the header row exists today, the footer stays one row in every state (it loses a row while tracking), and the group controls add no height. Six primary destinations unchanged; More is not a destination. No new shortcut. The pill is not a task property. The drawer's budget is `phone-v2`'s.

**D12. Size.** `brand.svg` under 2 KB, inlined once; the wordmark is text. The main bundle grows by about 1 KB gzipped (the two components and the pill). The regenerated PNGs replace files of the same size class; the maskable icon adds one 512 px PNG of about 6 KB. The binary and the image grow by that amount. No runtime memory change.

## Risks / Trade-offs

- [The mark drawn to the brief is not good enough at 16 px] → the Brand story at 16 px in both themes is the gate; if the loop and the tick merge, the opening angle widens (the brief allows 60°–80°) before the baseline is frozen.
- [A due review is less visible in Lists only and Companion while More is closed] → accepted in D7; the Loop home, the Daily check and the Review entry's own dot carry it; the weekly digest is unaffected.
- [Hidden controls hurt discoverability for new mouse users] → the controls appear on hover anywhere in the group, not only on the header; the first-run guide's "add a project" step points at the header; coarse pointers see them always.
- [`tokens-v2` and this change land in either order] → the tone table names the fallback tokens; the spec names tones, not tokens, so no spec text changes with the order.
- [Browsers cache old icons] → paths are unchanged, so an installed app refreshes on its next manifest check; the changelog entry says the icon changed and that a reinstall is never needed.
- [Store listing icons for the extension must be re-uploaded by hand] → the extension version bump is in the tasks and the README's release checklist gains the step.

## Migration Plan

Deploy as a normal release: no migration, no data change, no environment variable. The manifest keeps its icon paths and adds the maskable entry; the service worker precaches the new files. The site bundle adds `brand/`, documented in `docs/site-bundle.md`'s path table; the website reads it in a follow-up on its own repository. Rollback: the previous release's assets return with its binary; nothing persisted depends on the mark.

## Open Questions

- The exact opening angle of the loop within 60°–80° is settled by the 16 px baseline review during implementation and does not change the specs.
- Whether the workbench's Brand story also shows the mark in every accent theme (eight baselines) or only emerald and one other; a cost question for the ui-check matrix, decided at task 6.1.
