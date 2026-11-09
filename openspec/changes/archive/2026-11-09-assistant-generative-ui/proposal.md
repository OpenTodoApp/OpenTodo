# Proposal: assistant-generative-ui

## Why

The in-app assistant's safety model is solid: it proposes changes, you review them, then they apply and can be undone. But everything it shows is Markdown prose plus one flat change-set card. Modern assistants render what they talk about as real interface: a list of tasks you can tick off, a day plan on a calendar, places on a map, choices as buttons. Next to them, ours reads like a text box.

Most of the parts already exist in the app: `TaskRow`, the day and week columns, the location map, the note renderer, and live task links in `MarkdownView`. What's missing is a way for the model to ask for them, and a transcript that can show them.

## What Changes

- **Blocks in answers.** The in-app assistant gets a small set of *display tools*: show tasks, show a day or week, ask a choice, show a map, show a note, show a project outline. A display tool changes nothing. It streams a `block` event that carries only ids and parameters. The device renders it with the app's own components from its local data, so a block stays live, works offline, and works for encrypted accounts. Display tools are offered only to the in-app assistant, on the server and on the device, and never to MCP clients.
- **Proposals in their own shape.** A proposed change set renders as a calendar when it reschedules work within a week, as an outline when it creates a project with its tasks, and as a map when it sets places. The list stays one switch away. Review, apply, Undo, the limits and the operations are unchanged.
- **Editing a proposal before applying.** A proposed task's title, its dates and its priority can be edited in the card. The edited value is what applies.
- **Live task references in prose.** The fixed instructions tell the model to link every task it names as `[title](?task=<id>)`. The existing renderer then shows each one as a live chip with the current title and done state.
- **Steps stay visible.** The progress lines of an answer ("Looking at Today…") stay on the message as a collapsed "n steps" disclosure. Today they disappear when the answer ends.
- **Message actions.** Copy an answer, regenerate the last answer, and edit the last question and send it again.
- **Following the stream.** The transcript stays at the bottom while an answer streams and lets go when the user scrolls up, with a "Jump to latest" control. This adds the `use-stick-to-bottom` dependency to the lazily loaded assistant chunk.
- No **BREAKING** change: no op field, no route, and no environment variable is added or changed. The turn stream gains one event type, which older clients ignore.

## Capabilities

### New Capabilities

- `assistant-blocks`: the display tools of the in-app assistant and the blocks they produce, plus the transcript features around them (task links in prose, steps, message actions, following the stream).

### Modified Capabilities

- `in-app-assistant`:
  - The turn route streams a `block` event.
  - A reviewable change set has shapes besides the list, and its items can be edited before applying.

## Out of scope

- **Memory and custom instructions** ("I work four days a week"). These need their own privacy design: where memory lives, whether it syncs, and how the consent disclosure names it. That is a separate change.
- Showing the model's reasoning (thinking). It is provider-specific, would cost extra output tokens, and is not available the same way in the on-device loop.
- Conversation branching (a tree of edited questions). Editing the last question replaces what followed it.
- Display tools for MCP clients, and blocks in routines' AI steps.
- Charts of tracked time and any block not listed above. They can be added later through the same mechanism.
- A chat framework (assistant-ui, the Vercel AI SDK, Streamdown). The thread store, composer, review card and both loops are already this app's own. Only the scroll behaviour is adopted.

## Roadmap

This advances the shipped AI row 3 of `ROADMAP.md`, "Conversational assistant in the app" (`in-app-assistant`, `assistant-surface`). It keeps the "You approve every change" principle: blocks only show, and every write still goes through the proposal review.

## Impact

- **Server** (`internal/assistant`):
  - The display tool definitions and their validation: ids exist, are visible to the user, and are not in a project kept away from assistants.
  - A per-turn block limit.
  - The `block` stream event in `internal/httpapi/assistant.go`.
  - The task-link and block guidance in the fixed instructions.
  - The device manifest, regenerated with the display tools.
- **Device loop** (`web/src/lib/assistantDevice`): the same display tools from the manifest, validated against local data, with parity vectors.
- **Web** (`web/src/app/assistant`, `web/src/lib/db.ts`):
  - The block renderers, one lazy chunk each.
  - `AssistantMessage.blocks` (optional and additive in the local thread store).
  - The steps disclosure and the message actions.
  - Proposal shapes and edits in `ChangeSetReview`.
  - The scroll behaviour.
- **Dependencies**: `use-stick-to-bottom` (MIT), in the assistant's lazy chunk only. The first-load bundle budget is unchanged. No Go dependency.
- **Docs**: `docs/` pages on the assistant and the API stream events.
