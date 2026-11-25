# Design

## Context

The compact touch editor (`InlineEditor` with `compact`) is the title field with Save and Cancel and no edit bar. The short left swipe opens it (`releaseOf` returns `edit-title` from 48 px to below 96 px when the row gets `titleOnLeft`). So does the single-task row menu. `TaskListView` gave rows `swipeEditTitle` only below 768 px. Swipes themselves are on only without a fine pointer (`useListSwipe`). `watchVisualViewport` keeps the focused field above the keyboard.

## Decisions

**D1. The short swipe follows the swipe, not the width.** `swipeEditTitle` is true outside timelines. Since a row swipes only without a fine pointer, that means every touch screen, phones and tablets. A desktop with a mouse is unchanged. A hybrid with a mouse connected counts as fine and does not swipe, as today.

**D2. Return says Done and saves.** The compact field sets `enterKeyHint="done"`. Enter already blurs the field, and the blur saves.

**D3. A tap outside saves, and only saves.** While the compact editor is open, a capture listener on `pointerdown` follows a press that starts outside the editor and outside the overlays its pickers open (`[data-overlay]`, `[data-overlay-root]`). The press counts as a tap when it moves less than 10 px and is not cancelled. On its release the field is blurred, which saves through `TitleField` as any blur does, and the click that follows within 400 ms is swallowed (`swallowClick`). The listener follows the tap even if focus already moved on the press and the editor closed. A scroll or a swipe ends with movement or `pointercancel`, so the editor stays open.

The tap does nothing else because a person dismissing the keyboard should not land on another task's page, and iOS does not blur a field for a tap on content that takes no focus. Cancel still discards, and Return still saves.

Alternatives considered:
- Rely on blur alone. iOS keeps the field focused for such taps, and Android moves focus and also opens the other row.
- `preventDefault` on the press. It changes what the other row's hold and drag see.

**D4. The editor stays above the keyboard.** `watchVisualViewport` moves the nearest `[data-inline-compact]` of the focused field instead of the field, so Save and Cancel stay in view. Other fields are unchanged.

**D5. Subtasks.** Subtask rows in a list are task rows. They swipe, edit and save the same way, with the same write-access rule.

## Interface budget

No chrome row, task property, sidebar destination, scroll region or shortcut is added. Save and Cancel show only while the editor is open.

## Data model

None. The edit is the existing title operation. It works offline and converges per field.

## Size

No dependency. A few hundred bytes of script.

## Risks

- A short swipe released early on an iPad now edits instead of returning. This is the same rule as on a phone.
- Real-device check: whether the keyboard shows when the swipe's release focuses the field in WKWebView, whether the iPad keyboard shows Done, and whether the editor stays above the keyboard. These are verified during review.
