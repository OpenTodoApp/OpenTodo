# Design

## Context

- **The turn loop.** `internal/assistant/loop.go`: `Loop.Run` builds `SystemPrompt(TurnInput, now)` (fixed instructions, today's date and zone, the untrusted-data rules, plus the view and selected task ids), lists tools with `Tools.Definitions(caller)` from `internal/agenttools` (the registry shared with MCP), and runs up to 8 tool rounds. Write tools only `Plan` into a draft change set (at most 50 entities), returned to the browser for review.
- **The route.** `POST /api/v1/assistant/turn` (`internal/httpapi/assistant.go`) takes `turnRequest{messages, timezone, view, selected}`, requires a session, one turn per user at a time, caps, and the encrypted-account refusal.
- **The panel.** The client panel lives in `web/src/app/assistant/` (`AssistantPanel`, `ChangeSetReview`, `AssistantConsent`, `AssistantSettings`), opens with `Shift+I`, and applies with `mutateMany()` plus undo.
- **The MCP server.** `internal/mcp/server.go` advertises `tools` and `resources`. The `mcp-server` spec currently states that `initialize` does not list `prompts`.
- **Working hours.** These are per-device grid preferences in `web/src/lib/calendar.ts` (`startHour`, `endHour`, `dayLength` in minutes, defaults 6, 22, 480).
- **Free shortcuts.** Go sequences in use: `g` then `i t u c l f v s a x h d w ? Shift+I`. `g` then `k` is free.
- **Specs:** `specs/assistant-skills`, `specs/in-app-assistant`, `specs/mcp-server` and `specs/web-app` in this change.

## Goals / Non-Goals

**Goals:**
- Skills are data: adding one is a definition plus tests, with no new loop or tool code.
- One definition serves the panel, the composer and MCP prompts.

**Non-Goals:**
- User-defined skills, attachments, new read tools, or a command palette (see proposal).
- Changing the system prompt's safety rules, limits or the review flow.

## Decisions

### D1. Skill definitions in `internal/agenttools/skills.go`
```go
type Skill struct {
    ID, Name, Description, Example string
    Instructions string     // appended after the fixed system prompt
    Tools        []string   // allowed tool names (subset of the registry)
    Result       string     // "changes" or "answer"
    Subject      string     // "" | "selection" | "pasted" (what the user text means)
}
var Skills = []Skill{ ... five entries ... }
```

The skills keep the registry as the single place where agent capabilities live, and MCP can import them without depending on the assistant package. A test checks that every skill's tools exist in the registry and that `answer` skills list only read tools.

Tool subsets:
- `idea-to-project`: `list_projects`, `create_project`, `create_tasks`, `create_label`.
- `plan-week`: `list_tasks`, `search_tasks`, `get_task`, `schedule_tasks`, `update_tasks`.
- `weekly-review`: read tools, `schedule_tasks`, `move_tasks`, `complete_tasks`, `update_tasks`, `trash_tasks` (the existing rule limits trashing to tasks created in the same proposal, so the review proposes completing, rescheduling or moving tasks, never losing them).
- `triage-inbox`: read tools, `update_tasks`, `move_tasks`, `schedule_tasks`, `create_label`.
- `break-down`: `get_task`, `create_tasks`.

### D2. Running a skill in the loop
`turnRequest` gains optional `skill` (id) and `workday` (`{startHour, endHour, dayLength}`, validated ranges), and `TurnInput` carries them. With a skill:
- `SystemPrompt` appends a "Skill: <name>" section with the skill's instructions and, for `plan-week`, the workday numbers and the rule "never plan more than dayLength minutes per day, count existing estimates, default 30 minutes for tasks without one".
- `Definitions` is filtered to the skill's tools.
- `Lookup` refuses tools outside the subset with the existing "unavailable" result.
- The result type is enforced. An `answer` skill can't carry a change set, because no write tools are offered.

An unknown id returns `400 unknown_skill` before any provider call. The skill id is recorded with the turn's usage row for the owner's usage view. No conversation content is stored server-side.

Alternative considered: skills as client-side prompt templates. Rejected because the browser could be tampered with to widen tools, MCP couldn't share them, and instructions would ship to every client.

### D3. Pasted text
The composer and panel detect a paste longer than 280 characters or containing line breaks, and send it as a separate message part marked `untrusted: true`. The server wraps it in the same `untrusted_text` envelope the tools use. The system prompt's untrusted-data rule then applies unchanged. The 256 KB turn limit includes it.

### D4. Composer and Ask screen (client)
- **`AskComposer`** in `web/src/ui/patterns` (with stories in light and dark): a text area, a Skills menu (the existing `Menu` primitive with menu semantics) and up to three example cards (`Card`).
- **Placement:** the Today view renders it above the list when the assistant status says available, and as part of the empty state when Today is empty. The new route `ask` (`/ask`) renders it plus the full skill list.
- **Behaviour:** sending, choosing a skill or choosing a card opens the existing `AssistantPanel` through its root store with `{text, skill}` prefilled. The panel gains the same Skills menu above its input.
- **Shortcuts:** `g` then `k` opens Ask (added to the shortcut table, so the `?` overlay and the keyboard guide update automatically). "Break this down" is added to a task's overflow menu.
- **Availability:** decided from the existing assistant status call. When it's off, members get nothing and owners get a one-line hint with a dismiss stored in device settings. Encrypted accounts get the explanation instead of the composer (spec).

### D5. MCP prompts
`internal/mcp` adds `prompts/list` (id, name as `title`, description, one optional argument `text`) and `prompts/get` (returns `messages`: a user message with the skill's instructions, the workday note for `plan-week` when the client passes `workday` arguments, and the user's text). `initialize` advertises `prompts: {listChanged: false}`. Authentication, token scope, write switches and limits are untouched: prompts are text, and every action still goes through `tools/call`.

### D6. Skill quality
Each skill's instructions specify a fixed output shape (for example `idea-to-project`: one project, 2–6 sections, 3–20 tasks, estimates in minutes, no due dates unless the idea names one). They're short, to work with small local models. Tests use a scripted fake provider (as `loop_test.go` does) to check tool filtering, refusals and prompt assembly. Quality is reviewed manually with the default model before release, and the prompts are kept in the repository, so improvements are reviewable diffs.

## Risks / Trade-offs

- [AI prominence versus principles] → The composer appears only when the assistant is available. Members never see an upsell, and owners get one dismissible line.
- [Large proposals from planning skills] → The existing 50-entity limit and review apply. Skills instruct the model to propose the first 50 and offer to continue.
- [Prompt injection through pasted text or task content] → The same untrusted envelope and rules as tool results. Write tools still only propose.
- [Model quality varies] → Fixed output shapes, short instructions, review before apply, and undo.
- [Size] → No dependency. A few KB of instructions. The client adds one component and one route, a few KB gzipped. No effect on image size or runtime memory.

## Migration Plan

Additive: a new route, optional request fields, a new MCP capability and new UI. Older clients ignore the skill list, and older MCP clients ignore prompts. Rollback is a revert. No data is stored beyond the skill id on usage rows (an additive column or a JSON field in the existing usage record).

## Implementation notes

- **No section tool.** The registry has no `create_section` write tool, so `idea-to-project` builds phases as top-level tasks of the new project with subtasks under them, instead of sections. Adding `create_section` would widen the MCP write surface and is left to a follow-up change; the spec scenario's "sections" is met by phases until then.
- **Skill usage.** Usage is kept per month (`assistant_usage`), so the skill id is counted in a new table `assistant_skill_usage(user_id, month, skill, turns)` (migration 0030) rather than on a per-turn row.
- **Pasted text** is sent as a user message with `untrusted: true`. The loop wraps it in the `untrusted_text` envelope and folds it into the following user message, so providers that need alternating roles see one message.

## Skill review with a small local model (task 5.2, partial)

Run on 2026-10-15 against `qwen2.5:3b` through Ollama's OpenAI-compatible endpoint (the `compatible` provider, private endpoint allowed), CPU only, with realistic seed data (two projects, overdue and today tasks, five Inbox tasks), through `POST /api/v1/assistant/turn`:

| Skill | First run | After the fixes below |
|---|---|---|
| `idea-to-project` | proposed the project, no tasks | no tool call; described a project in words |
| `plan-week` | proposed clearing a due date | timed out (CPU inference past the turn limit) |
| `weekly-review` | summary, no proposal | summary, no proposal |
| `triage-inbox` | summary, no proposal | summary, no proposal |
| `break-down` | refused: subtask in the wrong project | 7 subtasks with estimates under the selected task |

Fixes made from it:
- `create_tasks`: a subtask without `project_id` goes in its parent's project (it used to land in the Inbox and be refused). Covered by `TestCreateSubtaskInheritsParentProject`.
- Instructions now give explicit tool-call steps (`idea-to-project`: create_project, then phases, then work items), forbid clearing dates (`plan-week`), and ask for at least one proposal when anything is overdue (`weekly-review`).

Conclusion: a 3B model follows the shortest skill (`break-down`) but not the multi-step ones; the docs should recommend a model of 7B or more for local use. The review with the default Anthropic model is still to do (it needs a key); the safety properties do not depend on model quality, because every write is a reviewed proposal.

## Open Questions

- Exact wording of each skill's instructions, refined while testing with the default and a small local model. Doesn't change specs or tasks.
