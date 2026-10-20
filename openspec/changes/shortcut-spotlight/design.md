# Design

## Context

- `web/src/app/shortcuts/dispatch.ts` is the only `keydown` listener. A key that starts a longer sequence arms `pending` and a timer (`PREFIX_MS = 800`) that clears it. A key that completes nothing while `pending` ends the sequence silently. `armGPrefix` lets the Vim layer share `g`.
- The registry (`web/src/lib/shortcuts.ts`) holds every entry with `keys`, `description`, `section` and `scope`. The cheat sheet, the palette and `docs/keyboard.md` read it. The go-to entries are all `global`, with descriptions up to 90 characters.
- `ShortcutHelp.tsx` renders a `<table>` per section with `w-2/5` for keys, and prints each entry's keys as one `ui-kbd` span with alternatives joined by " / ", conditions in parentheses. `.ui-kbd` is `inline-block` with padding, so a wrapped keycap draws two bordered boxes that touch the next row.
- `dispatch()` skips non-global shortcuts while a `[role="dialog"]` is open, and go-to entries are global, so a spotlight that is a dialog does not block them.

## Goals / Non-Goals

**Goals:** make the pending sequence visible and cancellable; teach the second keys in place; a cheat sheet where nothing wraps into anything else, readable at a glance.

**Non-Goals:** fuzzy search in the spotlight (the palette does that), Vim operator hints, user-configurable keys.

## Decisions

### D1. The dispatcher exposes the pending prefix
`dispatch.ts` gains a tiny store: `subscribePrefix(fn)` and `pendingPrefix()` return the pending chords (or `[]`). `armPrefix` notifies, and `clearPrefix` notifies. A new `holdPrefix(on)` stops and restarts the expiry: while the spotlight is open, the prefix has no timer. Esc while the prefix is pending is routed to `clearPrefix` before any scope handler, so Esc never also closes the task panel behind the spotlight.

*Alternative:* the spotlight listens to `keydown` itself. Rejected: the dispatcher is the single listener by spec, and it already knows what completes.

### D2. A 250 ms delay before showing
`Spotlight` subscribes to the prefix. When it becomes non-empty, a 250 ms timer starts. If the prefix is still pending when the timer fires, the spotlight opens and calls `holdPrefix(true)`. Measured typing of `g t` by fluent users is 90 to 180 ms between keys, so they never see a flash. The 800 ms expiry still applies before the spotlight shows, and once it shows, there is no expiry. `prefers-reduced-motion` drops the 120 ms fade.

### D3. What it lists
`continuations(prefix, activeScopes())` in `shortcuts.ts` returns the entries whose chord sequence starts with the prefix and whose scope is active, de-duplicated by second chord, each with its `label` and `section`. Go-to entries get a `group` for the spotlight's own grouping (Views, Calendar, Review and planning, Tools) through a small table keyed by id, not a new registry field, so the cheat sheet's sections stay as they are. Entries whose handler is not registered (the assistant's `g k` when the assistant is off) are left out, using the same `frame.handlers[id]` test the dispatcher uses.

### D4. The spotlight is a small Dialog
It uses the shared `Dialog` primitive with `size="sm"`, `placement="center"`, no title bar beyond the keycap line, a close `IconButton`, and `aria-describedby` pointing at "Press a key". Focus moves into it (to the dialog container, not a button, so letters reach the dispatcher), and returns on close. Clicking a suggestion runs it, which makes the spotlight a mouse-usable launcher too. Its keycaps use the shared `Kbd` group. Width: 28 rem, two columns of suggestions, one below 400 px.

### D5. Keycaps that cannot overlap
`Kbd` becomes a group component: `<Keys keys={['g t', 'g T']} />` renders each chord as a `ui-kbd`, "then" between the chords of a sequence, and "or" between alternatives, inside an `inline-flex flex-wrap gap-1 shrink-0` container. `.ui-kbd` gets `white-space: nowrap` and `inline-flex`. A keycap is therefore one line. Only the gaps between keycaps can wrap, never the text inside a keycap.

### D6. The compact sheet
`ShortcutHelp` drops the table for a list of `flex items-center justify-between gap-3 min-h-8` rows: the label in a `min-w-0 truncate` span (the description in its `title` and accessible name), the condition as `text-hint text-faint` under it, and `Keys` on the right. Sections flow in CSS columns (`columns-1 md:columns-2 xl:columns-3`, `break-inside-avoid` per section). The dialog moves to `size="xl"` (64 rem), still capped at 80 % of the viewport height with its own scroller, and the search field pins at the top of that scroller. Entries without a `label` show their description clamped to one line. Labels are added for every listed entry over time. This change adds them for the sequence entries and the 20 most common entries (Tasks in a list, Everywhere).

### D7. The keyboard guide
The generator that writes `docs/keyboard.md` emits `<kbd>` per chord with "then" and "or" in text, and the Help renderer styles `kbd` with the same `nowrap` rule. The layout of the guide's tables is unchanged.

## Data model

None. No op, no preference.

## Size and resources

One component (about 120 lines) and labels in the registry: under 2 KB gzipped in the entry chunk. No dependency.

## Interface budget

No chrome row, no scroller, no new shortcut (the spotlight reacts to existing prefixes. Esc inside it is the overlay's own close). The spotlight is an overlay and is covered by the layout check's overlay list at 360, 390 and 768 px (on touch widths it can only be opened with a hardware keyboard).

## Risks / Trade-offs

- [The spotlight steals focus from a row] → focus returns to the element that had it, so the selection and the panel are unchanged after a cancel.
- [Screen readers announce a dialog on every `g`] → it only opens after 250 ms of hesitation, and its name is "Go to…", short.
- [Labels drift from descriptions] → both live in the same entry, and the registry test checks labels exist and are short.

## Migration Plan

Client only. Rollback is a client rollback.
