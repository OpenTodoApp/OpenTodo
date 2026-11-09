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
