# Tasks

## 1. Transcript polish (no server change)

- [x] 1.1 Instructions ask for task links (D7): add the task-link paragraph to `SystemRules` and regenerate the device manifest and `prompt.vectors.json` (`go test ./internal/assistant -run Device -update`). Verify that `go test ./internal/assistant` and the vitest prompt vector test pass, and that an answer's `?task=` link renders as the app's live internal link (`RefChip`, since note-links) in `assistantTranscript.test.tsx`.
- [x] 1.2 Steps disclosure (D8): after an answer ends, `AnswerItem` shows "n steps" as a closed `<details>` listing the stored `status` lines. Verify with a vitest happy-dom test: two status lines give "2 steps", the disclosure is closed, it opens by keyboard, and it is not in the live region.
- [x] 1.3 Following the stream (D8): add `use-stick-to-bottom` to `web/package.json` with the justification in the PR, and wire it to the transcript scroller with "Jump to latest" and reduced-motion instant mode. Verify with a test that scrolling up during a stream shows "Jump to latest" and stops following. Run `npm run build`, run `make bundle-budget` (first load unchanged), and record the assistant chunk's gzip delta.
- [x] 1.4 Message actions (D8): Copy (Markdown, with blocks written as plain text once group 3 lands), Regenerate on the latest answer (discards an unapplied review), and Edit on the latest question (truncates on send). They are disabled while streaming and offline. Verify with tests in `assistantPanel.test.tsx` for each action, including the scenario where regenerating keeps an applied proposal applied.
- [x] 1.5 Strings for the new copy in every locale under `web/src/locales/`. Verify with `make i18n-check`.

## 2. Display tools on the server

- [x] 2.1 `internal/assistant/blocks.go`: the six display `ToolDef`s with strict schemas and caps (D1), offered by the loop after the registry tools and filtered by a skill's tool list. Verify with `go test ./internal/assistant`: `TestDisplayToolsOffered` checks they are in-app only and filtered by skill.
- [x] 2.2 Checking and the limit (D2): schema check, then for each id: exists, not deleted, visible to the user, not excluded. The same "not found" for unknown and excluded ids, a limit of 4 per turn, and a short JSON tool result. Verify with table tests for unknown, excluded and deleted ids, an all-failed call, the fifth block, and wrong-kind ids.
- [x] 2.3 The `block` stream event in `internal/httpapi/assistant.go` (`assistant.Events.Block`), carrying only kind and parameters. Verify with `TestTurnStreamsBlock` in `internal/httpapi/assistant_test.go`: the block event sits between text events and contains no task title. The existing 401, 403 `session_required` and 413 scenarios still pass.
- [x] 2.4 MCP never lists display tools. Verify with a test in `internal/mcp` that lists tools with an `agent` token and finds none of the six.
- [x] 2.5 Skill tool lists gain their display tools (D1: plan-week, triage-inbox, idea-to-project, capture). Verify with the skills tests in `internal/assistant/skills_test.go`.
- [x] 2.6 Block guidance in `SystemRules` ("show a block when it saves reading; don't repeat it in prose; at most 4"). Verify with the regenerated manifest and `go test ./internal/assistant`.

## 3. Blocks in the web app

- [x] 3.1 Stream parsing and storage (D3): the `block` `TurnEvent`, and `AssistantMessage.blocks: {at, block}[]` set during streaming and stored with the thread. Verify with `web/src/lib/assistant.test.ts` (parsing) and `assistantStore.test.ts` (stored, cleared with the thread and at sign-out).
- [x] 3.2 `BlockFrame` and the split renderer: the answer's Markdown split at `at` offsets (clamped), a labelled group per block, the "Removed" state, an error boundary, and one live-region announcement per block. Verify with happy-dom tests for placement, the "Removed" state after trashing, and the announcement label.
- [x] 3.3 `tasks` block on `TaskRow`: ticking completes through `completeTask` with toast and Undo, and the title opens the task. Verify with a test that ticking writes one op from this device, works offline (fake-indexeddb, no network), and offers Undo.
- [x] 3.4 `calendar` block from `DayColumn` and `CapacityLine`, occupied hours only, no `data-scroll-y`, read-only. Verify with a test for a day with two timed tasks and its total. `budget.test.tsx` still passes.
- [x] 3.5 `choice` block: option buttons, "Something else" focuses the composer, choosing sends the option through `send`, and only the latest answer's block is active and disabled offline. Verify with tests for choose, older-block-disabled and offline-disabled.
- [x] 3.6 `map` block reusing `LocationMap` while maps are on, otherwise a list. Verify with tests that maps off renders the list and makes no map request (fetch spy), and maps on renders markers matching the list.
- [x] 3.7 `note` and `project` blocks (12-line clamp, Open note; sections with open counts, Open project). Verify with tests for each, including live update after an edit through `mutate()`.
- [x] 3.8 Stories for each block in `web/src/app/assistant/` (light and dark). Verify with `make ui-check` and `make ui-lint` (no raw colours, icons through `<Icon>`).

## 4. Display tools in the on-device loop

- [x] 4.1 Manifest `kind: "display"` and `lib/assistantDevice/blocks.ts` checking against Dexie with the same rules and limit (D2). Verify with `go test ./internal/assistant -run Device` (manifest current) and vitest `blocks.test.ts`.
- [x] 4.2 Shared `blocks.vectors.json` (arguments plus local data in, checked block and tool result out), run by a Go test and a vitest test. Verify that both suites pass on the same file.
- [x] 4.3 The device loop emits `block` events into the same conversation path. Verify with `loop.test.ts`: a recorded on-device turn shows a tasks block and the provider request contains no block content.

## 5. Proposal shapes and edits

- [x] 5.1 `lib/assistantShape.ts` `shapeOf(review)` (D5: outline, calendar within 7 days, map with maps on, otherwise list). Verify with unit tests for each rule and the 8-day case that falls back to the list.
- [x] 5.2 `ChangeSetReview` draws the chosen shape with the existing checkbox, counts, Enter, Esc and "changed since proposed", plus the List switch in the head. Verify with tests for the week-plan and new-project scenarios of the delta spec, toggling to the list keeping the same checked items, and the keyboard-only apply path.
- [x] 5.3 Editing proposed items (D6): title of created items, do-on, start, deadline and priority, only for fields in the patch, using the app's inputs and checks, marked "edited", merged at apply. Undo is unchanged. Verify with tests for the edit-before-applying scenario (created with edited values, Undo trashes it) and the offline edit converging through `mutateMany` with fake-indexeddb.

## 6. Docs and final checks

- [x] 6.1 Docs: the assistant page in `docs/` (blocks, shapes, editing, actions) and the API doc's stream events (`block`). Verify that the docs build and links pass in `make check`.
- [x] 6.2 Full verification. Verify that `go test ./...`, `cd web && npm test && npm run build`, `make bundle-budget`, `make openspec-validate` and `make check` all pass, and that a manual smoke run (`./bin/opentodo`, ask "plan my Thursday") shows a calendar block, task links and a calendar-shaped proposal.

## Workflow follow-up

- After merge: `/opsx:archive` merges `assistant-blocks` and the `in-app-assistant` delta into `openspec/specs/`. Run `openspec validate --all --strict` and add a CHANGELOG entry under Unreleased.
- At archive, change `docs/assistant-answers.md`'s `specs:` from `in-app-assistant` to `assistant-blocks`; the docs check accepts only capabilities that already exist in `openspec/specs/`.
