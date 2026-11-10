# Design

## Decisions

### D1. A display tool without a frame

`suggest_followups` is checked like `ask_choice`: text only, capped. It streams as a `block` of kind `followups`. The answer renders it as a row of buttons after the actions row, not as a framed block. Sending reuses `choose`'s path without marking a choice.

### D2. Instructions

Suggest only steps the assistant can do: concrete, short, and in the user's language. Never repeat a choice's options. At most three.

## Data model, size, interface budget

- **Data and size:** none, beyond a small renderer.
- **Interface budget:** one row inside the transcript; no new shortcut.

## Risks / Trade-offs

- **Noise on every answer.** The instructions limit suggestions to answers where a next step is likely, and the eval checks they are absent for a plain fact question.

## Implementation notes

- **Offered on every turn.** `suggest_followups` is offered to a skill turn as well (`alwaysDisplay`, the manifest's `always_display`), since a skill's answer has next steps too.
- **Stored apart from the blocks.** The app keeps the suggestions on the answer as `followups`, not among its blocks, so they never land in its text, its Copy or the block count.
- **Older answers.** An older answer shows no suggestions at all rather than disabled ones; the latest shows them disabled offline and while an answer streams. An answer with a choice shows none, whichever came first.
- **Results.** A second call is refused with `followups_shown`, a call after `ask_choice` with `choice_asked`; neither counts toward the block limit.
