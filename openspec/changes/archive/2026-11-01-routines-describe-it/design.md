# Design

## Context

- **Routines** (`routines-engine`, `routines-editor`, `routines-dynamic-data`): `rule.steps`, the shared type checker (`web/src/lib/rules/steps.ts`, Go `internal/ruleval/steps_check.go`), the step catalogue route with availability, the draft test route, and the sentence-card editor.
- **Starters** (`routines-starters`): the Routines page offers "New routine" and "Start from a starter"; a starter opens in the editor as an unsaved draft.
- **Assistant** (`in-app-assistant`, `internal/assistant`): owner-configured providers, per-user consent, member keys, the monthly allowance and usage, tools from the shared registry that only plan, the on-device assistant for encrypted accounts, untrusted-text marking.

## Decisions

**D1. Visible** only when the user can make an assistant turn: on a plaintext account, the assistant is on and the user has consented for the current provider (or their own key); on an encrypted account, the on-device assistant is set up on this device and consented. Otherwise the entry is absent from the Routines page, and the palette's search for "describe" shows "Set up the assistant to describe a routine" with a link.

**D2. Request:** a bottom sheet, never a centred modal (DECISIONS.md "Routines UX"), with one text field ("Describe what should happen, and when"), at most 500 characters, and Draft. The server route `POST /api/v1/assistant/routine-draft` (session only, like the turn route) runs one assistant turn with:

- fixed instructions;
- the catalogue of **available** steps as the schema of one tool `draft_routine`, whose input is a routine (name, trigger, condition, steps, in the engine's JSON);
- as context, the names and ids of the user's projects, sections, labels, views and webhooks (the fields the consent disclosure already lists).

The model may call no other tool. The server type-checks the draft; if it fails, the errors go back to the model once; if it fails again, the answer carries the draft and its errors. The instructions follow `routines-dynamic-data`: data flows from the trigger and earlier steps, and the draft never holds a task chosen by hand.

**D3. Answer:** `{draft, errors, warnings, usage}`; the editor opens the draft with a banner "Drafted by AI: check each step, then Save", errors shown on their cards with fixes. The route and the device **never** save, enable, test or run the draft; the user does.

**D4. Limits and usage:** one turn. It counts toward the monthly allowance, is refused with 429 `assistant_quota` at the cap and with 409 `turn_in_progress` while another turn runs, and records usage like any turn with `kind: routine_draft`. At most 10 drafts per user per hour (429 `rate_limited`).

**D5. Encrypted accounts:** the same request runs in the browser through the on-device assistant with the device's provider and key, with the decrypted names as context and the same tool and check (the shared TypeScript checker); nothing reaches the OpenTodo server.

**D6. Untrusted text:** the user's sentence is the user's own request; project, label and view names in the context are marked untrusted like every tool result, and the instructions say to ignore instructions inside them.

**D7. Demo:** the route is under the assistant's routes, which the demo refuses.

**D8. CLI and MCP:** not offered. An assistant connected over MCP is itself a model and already writes routines with `create_routine` from the same catalogue and checks; a draft route for it would be a model calling a model. The CLI has no session (the route is session only, like the turn route) and its users write routines with `ot routine` or an MCP assistant.

**D9. Shared prompt:** the device builds the same request as the server from the manifest the server generates (`routine_draft`: the fixed instructions, one catalogue line per kind, the tool), pinned by `routineDraft.vectors.json` (the system text, the message and the reading of the tool's answer). The fixed instructions carry four examples drawn from the starters; a Go test type-checks them.

## Data model impact

None in the op schema: a routine started from a draft is an ordinary routine once saved. The assistant's usage gains its routine_draft part: the table `assistant_usage_drafts` (migration 0054, counts only), listed as `drafts` in `GET /api/v1/me/assistant/usage` (server state).

## Size and memory

No new dependency. The sheet joins the routines lazy chunk (about 3 KB gzip). First load unchanged. The route holds one draft in memory.

## Interface budget

- **Chrome rows:** the entry sits in the Routines page header with the other two; the sheet has its title row: unchanged.
- **Sidebar destinations:** none.
- **Scroll regions:** the sheet: 1.
- **Shortcuts:** none new.

## Open questions

- **Drafts per hour.** Default chosen: 10 per user per hour, on top of the monthly allowance.
