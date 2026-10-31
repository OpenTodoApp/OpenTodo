# Design

## Context

- `EditorToolbar({ view, env, visible, onMenu, coarse, always })` renders a `role="toolbar"` row of `IconButton`s (Bold, Italic, Link, Bullet list, Checklist) and a More menu of the remaining editor commands. It returns nothing unless `always`, or a coarse pointer while `visible` (the editor has focus or its menu is open). Its `onMouseDown` prevents default, so pressing a button keeps the editor's selection.
- `NotesEditor` renders it with `visible={editing || menuOpen}` and no `always`, so on a fine pointer it never shows. `TaskNotes` (task page and docked panel) and `ProjectNote` both use `NotesEditor`; the editor chunk is lazy.
- The composer keeps `const [formatting, setFormatting] = useState(false)` and passes it as `always` through `RichComposerField`; the toggle is an `IconButton icon="bold"` with `aria-pressed`, shown only on a fine pointer. Its state resets every time the composer mounts.
- Settings › Account › Profile has the How you work card (`HowYouWorkSection`, copy id `how-you-work`), which already holds synced method switches such as Energy levels (`user_prefs.energy`).

## Decisions

**D1. One toggle component, two surfaces.** A `FormattingToggle` in `EditorChrome.tsx` (an `IconButton` with the bold icon, label "Formatting", `aria-pressed`, `aria-controls` naming the row) is used by the note editor and the composer. Its state comes from `useFormattingRow(surface)` with `surface` `'notes' | 'comments'`, which reads and writes the device's `localStorage` (`ot:formatting-row:notes`, `ot:formatting-row:comments`), wrapped in try/catch, default off, shared live across the tabs of the device through the `storage` event. Separate surfaces because notes are long-form and comments short; one person may want the row in one and not the other.

Alternative: store it as a synced preference. Rejected: whether the row is open is about this screen and pointer, not the account; a phone never uses it.

**D2. Where the toggle sits in a note.** At the note's top end corner, inside the note's own box, overlaying the note's first line's end padding (the note gets padding at the end of its first line so text never runs under it). It uses the `.ui-reveal` rule: hidden by opacity until the pointer is over the note or focus is within it, always visible while pressed, never removed from the Tab order. It precedes the editable text in DOM order, so Shift+Tab from the note reaches it. Read-only notes (a viewer of a shared project) have no toggle.

**D3. When the row shows on a fine pointer.** While the toggle is pressed, the row is shown above the note at rest too (`always`), so pressing the toggle with the mouse shows the effect at once. It lives inside the panel's or the page's existing scroller, not as page chrome, like the touch row. On a coarse pointer nothing changes: no toggle, the row appears while the note has focus (`rich-text-editing` "Editing toolbar on touch screens").

**D4. The setting.** `user_prefs.formatting_toggle`: `""` (default) or `"on"` shows the toggle; `"off"` hides it. An unknown value reads as shown and is not rewritten, as for the other preferences. It is a How you work row because that card is where the account's "what the app shows me" choices live, and the plan puts the setting under Account; it is synced so a person who does not want the button sets it once. With it off, on a fine pointer, neither notes nor the composer show the toggle and the row is not shown even if the device remembered it open; the remembered state is kept for when the switch is turned back on. Copy: "Formatting button": "A button beside notes and comments on a computer that shows bold, lists and links."

Alternative considered: Settings › Appearance › Task details. It fits "how a task looks" but the switch is also about comments and project notes, and it is a choice about how much the app offers, which How you work already gathers. Kept as an open question.

**D5. Keyboard and screen-reader behaviour.**

- The toggle is reachable with Tab and activated with Enter or Space; its name is "Formatting" and its pressed state is announced. Focus stays on the toggle after activation.
- The row becomes a proper toolbar: one Tab stop (roving `tabindex`), Left and Right move between controls, Home and End go to the first and last, the More menu opens with Enter, Space or Down. Escape inside the row returns focus to the note with its selection kept. The toolbar keeps its name "Formatting". This also improves the touch row and the composer's row, which use the same component.
- A command run from the row puts focus back in the note so typing continues.
- No new shortcut: every command already has a key or a slash entry (the editing section of the cheat sheet), so the shortcut registry is unchanged and no conflict is possible.

**D6. Comment composer.** Uses `FormattingToggle` and `useFormattingRow('comments')`; the row shows while the toggle is pressed, as today, and the state survives closing the panel. The setting hides it like the note's. The `comments` requirement is modified accordingly; nothing else in the composer changes.

## Data model impact

One additive preference `user_prefs.formatting_toggle` (kind string, default `""`) declared in `internal/sync/ops.go` `Schema`; regenerated `opSchema.ts`, `internal/e2ee/contentfields.go` (unchanged list: not content) and the contract fixture. LWW per field, written offline, converging like every preference. No op renamed or removed.

## Size and memory

No dependency. The toggle, the hook and the toolbar's roving focus are in the lazy editor chunk (about 0.6 KB gzip); the first load grows only by the preference default (under 0.3 KB). No server effect.

## Interface budget

- **Chrome rows:** none added; the toggle overlays the note's own box, and the row lives inside the panel's or page's scroller like the touch row.
- **Task properties:** unchanged.
- **Sidebar destinations:** unchanged.
- **Scroll regions:** unchanged.
- **Shortcuts:** none added.

## Open questions

- **Where the switch lives.** Default chosen: Settings › Account › Profile › How you work, "Formatting button". Alternative: Appearance › Task details.
- **Default of the remembered row.** Default chosen: off on a new device (the toggle is visible on hover and focus, the row only on request).
