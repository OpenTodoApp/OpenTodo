# Routines: the Ask AI step, proposals and encrypted accounts

## Why

Some routine steps need judgement no fixed step has: "turn these meeting notes into tasks with sensible titles", "summarise what I finished this week", "sort the Inbox lines into Work and Home". The in-app assistant can do this on request, but not at 17:00 on a Friday while nobody is looking. The owner decided (DECISIONS.md, "Routines", 2026-10-31) how an AI step behaves: by default its result is a **proposal** waiting for the user (one tap to apply); a routine may opt into applying without asking only for small, additive changes, never more than 20 items, always visible, always undoable, and it falls back to proposals on its own after a limit hit or two failures in a row; each routine has a daily token budget. The same change brings routines with text to **encrypted accounts**: the server cannot read their text, so those routines run on one of the user's own devices through the device relay, while routines without text keep running on the server.

## What Changes

- **Ask AI** and **Summarise** steps (group "AI"): Ask AI takes the user's instruction (at most 2,000 characters) and up to three inputs (Text, Lines, Tasks, a Project), and answers as Text or as Lines; Summarise takes Text, Lines or Tasks and answers Text (short, medium). The model gets **no tools**: it only returns text, which later steps of the routine use. Inputs go to the model as untrusted text with the assistant's fixed defences; the answer is marked "Written by AI" wherever it is shown. At most 3 AI steps per routine.
- **Provider, consent, usage** come from the assistant (`in-app-assistant`): the owner's provider or the member's own key; the consent disclosure gains a paragraph on routines (inputs are sent on schedule, while the user is away), so existing consents are asked again before an AI step is available; tokens count toward the run-as user's monthly allowance and usage like turns, own-key runs as own key.
- **Proposals by default.** A run of a routine with an AI step plans every step and writes nothing: its planned changes become a **proposal**, shown in the Inbox card ("Sort inbox · proposal waiting · Review"), with a bell notification, reviewed item by item like an assistant change set and applied in one tap (all or the ticked items) with one Undo. A proposal expires after 7 days. Items whose target changed since are skipped and counted on apply.
- **Apply without asking** (per routine, off by default, only from the app by the person): allowed only when every write after an AI step creates tasks, comments or labels or sets task fields (priority, due, start, deadline, energy, labels added, section in the same project); never completes, trashes, moves out of a project, edits projects or notes. At most **20 items** per run; the run is always shown in the Inbox card with Undo. It **falls back to proposals** automatically after a run that would exceed a limit or after two failed runs in a row, says so in the card, and stays in proposal mode until the person turns it on again.
- **Agents cannot turn it on.** An MCP agent or the assistant may create or edit a routine with AI steps (`routines-engine`), which then runs in proposal mode; neither can set "Apply without asking". The field is refused on every agent path.
- **Daily token budget per routine** (default 20,000 tokens, 1,000 to 200,000): an AI step that would exceed it fails the run with `ai_budget`, counted as a failure. **Test** shows the estimated tokens before calling the model ("This test uses about 3,200 tokens") and the real count after; the live preview never calls the model.
- **Encrypted accounts.** A routine with content steps (text, notes, AI) runs on one of the user's devices: the server sends the occurrence over the device relay to an opted-in device that is online and unlocked ("Run my routines on this device", per device, server state), the device plans the routine with the shared planner on its decrypted data (AI through its on-device assistant), and commits the ciphertext writes through the server, which applies them with device `rule:<rule-id>`, enforces the limits and records ids and counts only. With no device available the run is **"Waiting for one of your devices"** for up to 24 hours (the latest occurrence per routine), then recorded as missed. **Run now** runs on the device in hand. Routines without content steps still run on the server. The editor warns when a scheduled or event routine on an encrypted account needs a device. Email and webhook steps with text stay unavailable on encrypted accounts.

Not **BREAKING**: two additive `rule` fields, additive server tables and columns, new routes behind the policy wrapper, one relay request kind; no new environment variable.

## Out of scope

- AI steps that call tools or browse (the model only returns text; no fetch-URL or RSS steps, AGENTS.md rule 5).
- Image, audio or attachment inputs to the model.
- Running AI steps on the server for encrypted accounts, or holding the account key on the server.
- Choosing a different provider or model per routine (the user's assistant provider is used).
- Shared routines' AI tokens and permissions (`routines-shared`).

## Roadmap

Advances milestone **1.1 "Routines"**, item `routines-ai-step`, fourth of five. **Depends on** `routines-engine` and `routines-editor`. GitHub issue: [#661](https://github.com/OpenTodoApp/OpenTodo/issues/661).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `routines` (new with `routines-engine`): ADDED "Ask AI and Summarise steps", "AI results wait as proposals", "Reviewing and applying a proposal", "Proposal routes", "Apply without asking", "Automatic fallback to proposals", "Agents cannot apply AI results without asking", "Daily token budget", "Testing AI steps", "Routines run on devices for encrypted accounts", "Waiting for a device", "Device run routes", "Encrypted-account warning in the editor".
- `in-app-assistant`: ADDED "Assistant consent covers routines".
- `end-to-end-encryption`: ADDED "Routines with content on encrypted accounts".

## Impact

- **Op schema:** `rule.ai_apply` (string, `auto` or empty) and `rule.ai_budget` (number), additive; regenerated `opSchema.ts`, contract fixture.
- **Server:** `internal/assistant` (a single-shot completion without tools for routine steps, the routines paragraph of the disclosure, usage tagged `routine`), `internal/rules` (AI steps, proposal mode, auto mode checks, fallback, budget, device runs and their commit), `internal/relay` (the `routine.run` request, the per-device routines opt-in, capabilities), `internal/agenttools` and `internal/mcp` (refuse `ai_apply` on every agent path), migration `NNNN_routines_ai.sql` (`routine_proposals`, `rule_ai_usage`, `rule_state` fallback columns, `relay_devices.routines`), `internal/httpapi` (proposal and device-run routes), `internal/notify` (`routine_proposal` from `routines-editor`).
- **Web:** `web/src/lib/rules/` (the planner for every step kind on the device, shared vectors extended), `web/src/lib/relay.ts` (answer `routine.run`), the AI cards and Test estimate, the proposal review, the auto-mode switch and its fallback notice, the encrypted-account warning and opt-in, six catalogs.
- **Size:** no new dependency. The device runner joins the routines chunk (about 8 KB gzip); the relay answers load it on demand. Server: proposals are held as JSON until handled (at most 500 items each, 7 days).
