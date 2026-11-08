# Design

## Context

The agent tools (`internal/agenttools`) are the one place where an AI assistant writes: over MCP with an `agent` token and in the in-app assistant's proposed change sets. The routine write tools (`routines-engine` D11) validate a definition as the REST routes do. Their only extra refusals were Apply without asking (`routines-ai-step` D6) and steps that act on other routines. Three step kinds send content off the server: `webhook`, `email_me` and `email_members`. The legacy rule actions have a `webhook` action as well. Their destinations are ones the person or the owner configured, but they can carry text and task data.

## Decisions

### D1. Refuse on every path that would let a sending routine send

The check is on the routine as it would be after the call, not only on the arguments:

| Tool | Refused when |
|---|---|
| `create_routine` | the new steps or actions contain a sending step |
| `update_routine` | the steps and actions after the change (given values, otherwise the stored ones) contain one |
| `set_routine_enabled` | `enabled: true` and the stored routine contains one |
| `run_routine` | `test` is false and the stored routine contains one |

Refusing only `create_routine` would leave two gaps. An assistant could add the step later with `update_routine`. It could also run or turn on a routine the person built.

### D2. An assistant does not run the person's sending routines

We asked whether an assistant may still run a routine the person built themselves that contains these steps. The answer is no. A run started by an assistant sends content out on the assistant's behalf, at a moment the assistant chose. A prompt injection could choose that moment, for example right after it put text into a task the routine reads. The person's own triggers, schedule and **Run now** are unchanged. The assistant can tell the person to run it.

A test stays allowed. A test plans every step, returns the plan to the caller and never delivers a webhook or sends an email (`routine_run.go` returns before the side effects in test mode). The assistant can already read everything a test shows.

Turning a sending routine off, and moving it to the Trash, stay allowed: they can only stop it from sending.

### D3. Changes that would still send are refused whole

An `update_routine` call that would leave a sending step in the routine is refused, even when it only renames the routine. The trigger and the condition decide when content goes out, and the steps before a sending step decide what goes out. Telling a harmless edit from a harmful one would be fragile. The person edits these routines in the app. Taking every sending step out is accepted, because the result sends nothing.

### D4. Reading the JSON rather than the parser

`sendsOut` walks the stored or given JSON and looks for any object whose `kind` is a sending kind, plus a non-null `webhook` key in actions. It does not rely on `ruleval.ParseSteps`. A definition the parser refuses is still judged by what it says, and the check runs before `Check`, so the refusal is the same whether or not the definition is otherwise valid. A text literal that happens to say "webhook" is a string value, not an object's `kind`, so it does not match.

### D5. Same code as Apply without asking

The refusal is a `ToolError` with code `forbidden_for_agents` and a message that names the steps and says the person does it in the app. An MCP client already handles that code from `ai_apply`.

## Data model

None. No field, op or migration. Existing routines are unchanged. A sending routine an assistant created before this change can no longer be changed, turned on or run by an assistant. It keeps running on its own trigger if it is on, and the person can find it in the app, where its history names the assistant.

## Size and memory

No dependency, no bundle change (server only), a few hundred bytes of code.
