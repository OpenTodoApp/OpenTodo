# Design

## Context

See proposal.md for the motivation. Relevant parts of the current code:

- **Turn loop.** `internal/assistant/loop.go` offers the shared `agenttools` registry's tools to the model, minus `notInApp` and filtered by a skill's tool list. It runs read tools, plans write tools into one draft change set, and emits `ev.Status(statusFor(...))` per tool call. `internal/httpapi/assistant.go` streams `text`, `status`, `changeset`, `usage`, `done` and `error` as server-sent events.
- **Device loop.** `web/src/lib/assistantDevice/` runs the same loop for encrypted accounts. Its tools, rules and skills come from `manifest.json`, which `go test ./internal/assistant -run Device -update` generates from the server's registry and checks. The prompt is pinned by `prompt.vectors.json`.
- **Thread store.** Threads live in Dexie as `AssistantMessage` (`web/src/lib/db.ts`). `status?: string[]` is already stored per answer. Only the latest line is drawn while streaming, and none after.
- **Markdown.** `MarkdownView` already parses `?task=<id>` links into a `task` node, and `app/Markdown.tsx` renders it live through the lazy `RefChip` (note-links), which also handles `?note=` and `?project=`. The assistant's instructions never ask for such links.
- **Review card.** `ChangeSetReview` draws a `Review` (`items`, `dropped`) as a list. Apply and Undo go through `mutateMany()` with device `assistant:<device-id>`.
- **Loading.** The assistant is a lazy chunk (`Shell.tsx`: `lazy(() => import('./assistant/AssistantRoot'))`), so nothing here counts toward the first-load budget.
- **Existing components.** `TaskRow`, the calendar's `DayColumn` and `CapacityLine`, `LocationMap` (MapLibre, lazy) and `LocationPreview` already exist.

## Goals / Non-Goals

**Goals:**
- One mechanism for every block, identical in the server and the device loop.
- Blocks carry ids only. Content is always read from the device's own data at render time.
- No new write path. Ticking a task in a block is the app's normal completion. Every other change is still a proposal.

**Non-Goals:**
- A general "render arbitrary UI" protocol, or HTML or JSON components chosen by the model. The catalogue is closed and every kind is ours.
- Server-rendered previews, or content in block events.
- Changing the shared agent registry's contract for MCP.

## Decisions

### D1. Display tools are assistant-only tools defined in `internal/assistant`, not registry tools

They are defined in a new `internal/assistant/blocks.go` as `ToolDef`s with strict schemas. The loop appends them to the offered tools, filtered by the skill like any other tool. `runTool` handles them before the registry lookup. The manifest generator emits them with a new `kind: "display"`, so the device offers byte-identical definitions.

- *Alternative: register them in `agenttools`.* MCP clients would then list tools that render nothing for them. The registry is the contract shared with external agents. Rejected.
- *Alternative: fenced Markdown blocks such as ` ```tasks `.* No schema, nothing for strict tool use to check, ids hallucinated freely, and no clean point to check exclusions before anything is shown. Rejected.

**Skills.** Each skill lists the display tools it may use:
- `plan-week`: `show_calendar`, `ask_choice`
- `triage-inbox`: `show_tasks`, `ask_choice`
- `idea-to-project`: `show_project`, `ask_choice`
- `capture`: `ask_choice`
- Others: none until a need shows.

### D2. Checking and the per-turn limit

`blocks.go` checks the arguments against the schema, then the ids:
- **Server:** through `opsync` reads (exists, not deleted, the user's scope) and `agenttools.Exclusions.Excluded`.
- **Device:** against Dexie with the same rules (`lib/assistantDevice/blocks.ts`), with the exclusions the device already applies to its read tools.

A counter on the turn enforces the limit of 4. The tool result is a short JSON such as `{"shown":"tasks","count":2,"not_found":1}`. It is never content, so a block costs the model almost nothing in tokens. Unknown and excluded ids give the same "not found", so the model learns nothing about excluded projects. Parity between the two loops is pinned by a new `blocks.vectors.json` (arguments and local data in, checked block and tool result out), run by both `go test` and vitest.

### D3. The `block` event and where it sits in the text

The new event is `event: block`, `data: {"kind":"tasks","ids":[…],"title":"…"}`, with one shape per kind (`tasks`, `calendar{date,span}`, `choice{question,options}`, `map{task_ids,place_ids}`, `note{id}`, `project{id}`). The client stores it on the message as `blocks: [{at, block}]`, where `at` is the length of the answer's text when the event arrived. The renderer splits the Markdown at those offsets. `at` is the offset where the tool call happened, which in practice is a paragraph boundary, because providers end a text block before a tool call. A split inside a line is safe anyway: each part is parsed separately.

- *Alternative: change `AssistantMessage` to a list of parts.* Cleaner, but it touches every reader of `text` (copy, announce, the device loop, tests) for no user-visible gain. `blocks` is optional and additive: old messages simply have none, and nothing needs migrating.

The `title` of `show_tasks` and the `question` and `options` of `ask_choice` are text written by the model. They render as plain text, like the rest of the answer, and are short-capped by the schema.

### D4. Renderers

`web/src/app/assistant/blocks/` holds one component per kind, behind `React.lazy`. `BlockFrame` provides the labelled group, the "Removed" state and the error boundary.
- **`tasks`:** `TaskRow` in a non-scrolling list. Completion uses the existing `completeTask` path, so it gets an op, the toast and Undo.
- **`calendar`:** a compact rendering built from `DayColumn` and `CapacityLine`, restricted to the occupied hours (no `data-scroll-y`).
- **`map`:** reuses `LocationMap` when `maps` are on (MapLibre is already lazy, so it loads only with the first map block), and a list otherwise.
- **`note`:** renders through `Markdown` with a 12-line clamp.
- **`project`:** reads sections and open counts from Dexie.

All of them read with `useLiveQuery`, which makes them live (spec "Blocks in the conversation").

### D5. Proposal shapes are chosen by the client

`lib/assistantShape.ts` provides `shapeOf(review): 'calendar' | 'outline' | 'map' | 'list'`, a pure function of the review's items and local rows, following the spec's rules in this order: outline, calendar, map, list. The model doesn't choose. The shape follows the change set's content, so it can't be wrong in a way the model invented, and the on-device loop needs nothing. The calendar and outline shapes reuse the D4 renderers with proposed items overlaid (the calendar's projected-block style, already used for series projections). The checkbox, the counts, Enter, Esc and the "changed since proposed" logic stay in `ChangeSetReview`. The shape is only the item area. The switch in the head is a `SegmentedControl` of two options. It is not a shortcut.

### D6. Editing proposed items

`Review` items gain `edits?: Record<string, unknown>`. Opening Edit on a row shows the app's own inputs:
- the title field;
- the When and Deadline popovers through `usePartEditor`;
- the priority menu.

Only for fields already in the item's `patch`. Apply merges `edits` over `patch` before `mutateMany()`. The Undo record stores the previous values exactly as today, so Undo needs no change. Checks reuse the field checks the task panel uses (title length, date format).

### D7. Task links

`SystemRules` gains one paragraph, carried to the device through the manifest: "When you name a task in prose, write it as [its title](?task=<id>). Use only ids from tool results." `prompt.vectors.json` is regenerated. A hallucinated id renders as plain link text through `TaskLink`'s fallback and opens nothing harmful (`openTaskPanel` of an unknown id shows "not found").

### D8. Steps, actions and following the stream

- **Steps:** `status` is already stored. `AnswerItem` gains a `<details>` with "n steps" after the answer ends. No server change is needed.
- **Copy:** builds Markdown from `text` with each block replaced by its plain-text form (`blockText(block)` from local data at copy time).
- **Regenerate:** drops the last answer (and discards its unapplied review) and calls `send` with the remaining messages.
- **Edit:** loads the last user message into the composer and, on send, truncates the thread before it.

These need no new route, because both reuse `POST /api/v1/assistant/turn` or the device loop.

**Following the stream:** `use-stick-to-bottom` (StackBlitz, MIT) on the transcript's existing scroller. It handles content that grows while streaming, the user's scroll intent, and resize, which are the edge cases a hand-rolled `scrollIntoView` gets wrong. It adds no runtime dependency of its own. Reduced motion maps to its instant mode.
- *Alternative: write it ourselves.* Around 80 lines, plus the spring and intent logic we would then have to maintain. The library is small and lives only in the lazy chunk.

### D9. Data model, size, memory and interface budget

**Data model:**
- No op field, no entity and no server table.
- Dexie gains optional `AssistantMessage.blocks`, an object field, so no index and no version bump.
- `Review` item `edits` exists in memory only.

**Server:** no Go dependency. The image size is unchanged. Runtime memory gains one counter per turn.

**Web:**
- `use-stick-to-bottom` adds a few KB gzip to the assistant chunk. It is measured and reported in the PR, and the first-load budget is unchanged.
- Each block renderer is its own lazy chunk. The map adds nothing new, because it reuses the MapLibre chunk.

**Interface budget:**
- Blocks live inside the transcript, which is the content column's one scroller, so they add no chrome rows and no scroll region. The calendar block shows only its occupied hours, and the map pans but doesn't scroll.
- Task rows keep `TaskRow`'s at most 7 visible properties.
- No sidebar destination and no shortcut is added. Message actions and the shape switch are buttons in the existing tab order.

## Risks / Trade-offs

- **The model overuses blocks** (a map for everything). → The limit of 4 per turn, block guidance in `SystemRules` ("show a block when it saves the user reading; never repeat its content in prose"), and an eval scenario in the loop tests with a recorded provider.
- **Server and device drift apart.** → One definition in Go, the generated manifest, and the shared `blocks.vectors.json`, checked by both test suites.
- **Offsets misplace a block** when a provider interleaves text and tool calls unusually. → `at` is clamped to the text length. A misplaced block still renders, just earlier or later in the answer.
- **The calendar shape picks wrongly** (for example, two deadline changes three weeks apart). → The rule requires all dates within 7 days, otherwise the list is used, and the list is always one switch away.
- **Editing turns the review into a second task editor.** → Only fields already in the patch can be edited, and only with the app's existing inputs.
- **Live blocks show content that changed after the answer** (an answer says "3 tasks overdue" while the block now shows 1 open). → This is intended (live beats stale). The prose stays as written, and the steps disclosure shows what was read at the time.

## Migration Plan

This is additive. Older clients skip the unknown `block` event, so the prose still reads, with tasks as links. Older devices running the on-device loop keep their previous manifest until they reload. Rollback means reverting the change: stored `blocks` on messages are then ignored by the old renderer.

## Open Questions

- Should the "n steps" lines eventually include which display tools ran? They currently use `statusFor`. A display tool's status line ("Showing 3 tasks") is cheap to add, and either way leaves the specs unchanged.
