# The phone's add sheet stays open for the next task

## Why

On a phone, the floating add button opens quick add as a bottom sheet, and sending a task closed it (#1038). Adding five things in a row meant five taps on the button, and the keyboard dropping and rising each time. The command bar's Add mode already keeps its box open after Enter, and a list's own quick add keeps its field, so the phone was the one place where capture stopped after one task.

## What Changes

- After a task is added from the phone's sheet (send or Enter), the sheet stays open with its field empty and focused, the keyboard up, and the new task visible in the list above it. Closing is as before: a tap outside, a drag down, Escape or the system Back.
- A pasted list confirmed as tasks keeps the sheet open too, so every add from the sheet behaves the same.
- A visually hidden status says "Added" after each add, so a screen reader hears that the task was saved while the focus stays in the field.

No new control, no setting, no new string (the status reuses "Added"), no server or sync change.

## Capabilities

### Modified Capabilities

- `natural-language-capture`: "Quick add tools on a phone" says the sheet stays open after an add.

## Impact

- Web app: `web/src/app/QuickAddSheet.tsx` (no `onClose` after an add; the status line).
- Tests: `web/src/app/quickAddSheet.test.tsx`.
- Docs: `docs/quick-add.md` (the phone paragraph), a changelog fragment.
- Out of scope: dragging the add button to choose where a task lands (#1036), a "keep open" setting (one behaviour, like the command bar), a toast per add.
- Roadmap: a capture improvement under the 1.x polish of quick add; it also serves the "brain dump" idea of the Gentle mode discussion (#1023) without new UI.
