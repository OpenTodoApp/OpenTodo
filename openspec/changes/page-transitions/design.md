 # Design: page-transitions

 ## D1. One hook in navigate

 `navigate(r)` already serialises route changes (`router.ts:477-491`). It gains `direction`: `forward` when the new route is a child of the current one (a static table: project → task page, notes → note, settings → section), `back` for the reverse and for history pops (`popstate`), `none` between top-level destinations. The direction is set on `<html data-nav>` for the duration so CSS picks the animation.

 ## D2. CSS

 `::view-transition-old(page)` and `::view-transition-new(page)` slide by 30% with a fade over `--duration-emphasis` with `--ease-spring`; `none` cross-fades over `--duration-ui`. The page body has `view-transition-name: page`; chrome has its own names so it stays. Reflow's per-row names are only set inside reflow, so the two never meet.

 ## D3. Budget

 Under 1 KB gzip. If it pushes the entry chunk over 148 KB, the transition code is a dynamic import started after first paint (navigation before it loads swaps at once, as now).

 ## D4. Tests

 vitest for the direction table and the skip rules; the layout check navigates Inbox → task page → Back with a recorded trace and reads that the old page ends at opacity 0; Playwright with `reducedMotion: 'reduce'` reads that no transition ran.

## Data model, size and budget

- Data model: none. No op field, no synced preference, no route.
- Container image and server memory: unchanged (web and shell only).
- First load: under 1 KB gzip; lazy after first paint if the entry chunk has no room. The entry chunk is at 147.4 of 148 KB (web/bundle-budget.json), so anything that would land in it is loaded lazily or paid for by a cut in the same change; `make bundle-budget` decides.
- Interface budget (docs/interface-guide.md): no new chrome; the header and bars stay still.
