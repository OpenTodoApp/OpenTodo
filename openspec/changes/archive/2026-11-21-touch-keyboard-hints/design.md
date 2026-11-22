# Design

## Context

Shortcut hints reach the screen in three ways today:

- **Badges**: the class `.ui-kbd` (`web/src/index.css`), written by `MenuItem`, `Tooltip` (`KeySequence`), the palette's rows and footers, `ScheduleSheet`, the Settings search field, and by `<Kbd>` (`web/src/app/shortcuts/Kbd.tsx`).
- **`<Kbd>` and "Show shortcut hints"** (`shortcuts/hints.ts`, off by default, per device): in the chrome a badge is printed only while the preference is on; off, `<Kbd only>` prints nothing and `<Kbd>` in a sentence prints the key as plain text. Menus, tooltips, the palette and the cheat sheet show keys always.
- **Plain lines** that only name keys: "Enter toggles or creates · Esc closes" under the label picker, "Arrows move by day and week…" under the date grid, "Keyboard, with a row focused: …" under settings tables.

A few places already hide their hints by hand (`pointer-fine:` on the palette footers, `sm:` on some lines), each with its own condition. None of them knows about a keyboard.

## Goals / Non-Goals

**Goals:** no badge and no keys-only line on a touch-only device; all of them on every computer and on a phone or tablet that has a keyboard; one rule in one place; nothing an assistive technology user needs is removed.

**Non-Goals:** a new preference; rewriting copy; changing which hints "Show shortcut hints" prints; the hand-made conditions on the palette footers (they stay, and agree with the rule on a phone).

## Decisions

### D1. The signal: no fine pointer and nothing that hovers

The rule hides hints under `@media not ((any-pointer: fine) or (any-hover: hover))`. Showing is the fallback: a browser that cannot answer shows hints, as today.

| Device | `any-pointer: fine` | `any-hover: hover` | Hints |
| --- | --- | --- | --- |
| Phone, tablet (Android, iOS; browser, installed app, shells) | no | no | hidden |
| Desktop, laptop | yes | yes | shown |
| Touch laptop | yes (trackpad) | yes | shown |
| iPad with a Magic Keyboard or a mouse | yes while attached | yes | shown |
| Phone with a Bluetooth mouse | yes | yes | shown |
| Phone with a hovering pen | yes | yes | shown (accepted) |
| Tablet with a keyboard and no pointer | no | no | D2 |

`any-*` asks about every input, not the primary one, so a touch laptop whose primary pointer the browser calls coarse still shows hints. The app's `pointer-coarse` idiom (`pointer: coarse`, the primary pointer) is the right question for target sizes and the wrong one here: it would hide hints on such a laptop. Width is no signal at all: a narrow desktop window has a keyboard.

The table's first two rows were checked in Chromium with touch emulation; the others follow from the media query definitions and need the owner's devices (tasks 3.4, 3.5).

Alternative: `navigator.keyboard`, `navigator.maxTouchPoints`, or the user agent. Rejected: the first is Chromium-only and says nothing about attachment, the others guess.

### D2. A keyboard without a pointer: the first hardware key press

No media query asks whether a keyboard is attached. `web/src/lib/keyboardSeen.ts` listens for `keydown` (capture, on the document) and sets `data-keyboard` on the root at the first press an on-screen keyboard cannot make, then removes its listener:

- a key pressed outside a text field (the on-screen keyboard is up only while a field has focus), or
- a chord with Ctrl, Alt or Meta, or Tab or Escape, anywhere.

Composition (`isComposing`, key code 229, `Unidentified`) and events made by scripts (`isTrusted` false; the sequence spotlight builds key events for a tap) never count. Nothing is stored: a keyboard may be gone tomorrow, and the first press brings the hints back. Until that press the person sees no hints; the first `Tab` or `j` fixes it, and the cheat sheet (D4) is complete from the start.

The module is loaded with a dynamic `import()` from `main.tsx`: the entry chunk sits at 145.9 KB of its 146 KB budget and a static import took it to 146.1 KB.

Alternative: persist the sighting per device. Rejected: it would show hints on a phone forever after one evening with a keyboard.

### D3. One rule, two markers

```css
@media not ((any-pointer: fine) or (any-hover: hover)) {
  :root:not([data-keyboard]) :is(.ui-kbd, [data-kbd-hint]):not([data-kbd-keep], [data-kbd-keep] *) { display: none; }
}
```

- `.ui-kbd` covers every badge without touching its component.
- `data-kbd-hint` marks what must go with the keys: a keys-only line, the tooltip's " · " separator with its key sequence, the "then"/"or" wrappers of `KeySequence`, `ShortcutKeys` and `Keys`, the empty box around quick add's badge.
- `data-kbd-keep` exempts an element and everything in it.

The rule is outside every cascade layer, so utilities such as `sm:inline` or `inline-flex` on a hint cannot bring it back, and it needs no `!important`. `display: none` removes the box, so flex gaps and margins go with it; the row's label takes the room.

It builds on `<Kbd>` instead of replacing its flag: `<Kbd only>` (chrome) renders a plain `.ui-kbd` and is hidden by the rule; `<Kbd>` inside a sentence sets `data-kbd-keep`, as its plain-text form already stays when the preference is off.

Alternative: a hook (`useKeyboardLikely()`) read by each component. Rejected: thirty call sites, a re-render on change, and the next badge added without it is wrong on phones.

### D4. What stays

- **The cheat sheet** (`ShortcutHelp`) is wrapped in `data-kbd-keep`. It is reference, the spec requires it to read well at 360 px, and it is how a person whose keyboard the app has not seen yet looks a key up. On a phone it opens only when asked for (the sidebar's Keyboard shortcuts item, the palette). The keyboard guide in Help renders its own `<kbd>` and is untouched.
- **The filter syntax card** uses `.ui-kbd` for query terms (`today`, `#label`), which are typed, not pressed: kept.
- **Sentences that say more than the key** keep their key: the Labels empty state, four settings descriptions, the assistant's review line, the Year and Month footers, the plan panel's and the empty Inbox pane's hint. Hiding the badge would leave "with , or create one here"; hiding the sentence would lose its other half. Rewriting them is copy work for another change.
- **Assistive technology**: `aria-keyshortcuts` is untouched, and a menu item's `aria-describedby` still points at its badge; an element hidden with `display: none` still gives its text to a description. Screen-reader-only key lines (`sr-only`) are not marked.

### D5. Lines marked as keys-only

The label and assignee pickers' lines (list and filter), the saved view's "Enter saves… · Esc discards…", the date grid's arrows line, the Plan footer, the three "Keyboard: …" lines in Settings, the comment box's "Send with Ctrl+Enter", share capture's "Enter saves · Esc cancels", Focus's key line and the Vim status bar's keys.

## Data model impact

None. No op, no field, no stored preference, no server change.

## Size

No dependency. CSS: one rule. JavaScript: a lazy chunk under 1 KB; the first load is unchanged (entry 145.9 KB gzip, entry and static imports 703.2 KB of 704 KB). Container image and runtime memory: no effect.

## Interface budget

Nothing is added to any screen: no chrome row, no task property, no sidebar destination, no scroll region, no shortcut. On touch-only devices elements are removed.

## Risks

- **A phone that reports a hovering or fine pointer it does not have** shows hints, as today. No regression.
- **A keyboard-only tablet user sees no hints before the first key.** Accepted (D2).
- **A new keys-only line without the marker** shows on phones. `docs/design-system.md` states the rule; the interface audit at 360 px is where it would be seen.
- **Checks that press keys on an emulated phone** (the layout check, the interface audit) count as a keyboard from the first press, so overlays they open by key still show hints there. That matches a real keyboard and keeps those layouts checked.
