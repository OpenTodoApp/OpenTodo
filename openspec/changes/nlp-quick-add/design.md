# Design

## Context

Quick add (`web/src/app/QuickAdd.tsx`) is a plain input that calls `createTask` with a title and the view's defaults. The task entity already carries `due` (`{date, time?}`), `priority` (1–4), `project_id` and `labels` (synced, no UI yet). There is no duration field. The op log is additive by construction (`internal/sync/ops.go` `Schema`, `web/src/lib/types.ts`, defaults in `web/src/lib/ops.ts`). Constraints: fully offline, deterministic across devices, multi-language, no new runtime dependency of any size that matters on a 110 KB bundle, keyboard-first.

## Goals / Non-Goals

**Goals:**
- One-line capture of title, due date/time, project, labels, priority and estimate, with live preview and an escape hatch for every interpretation.
- Deterministic: same input, reference date, languages and project list → same output on every device.
- Works with no network; vocabulary is bundled.
- Add `estimate_minutes` so durations have a home now, additively.

**Non-Goals:**
- Server-side or CLI parsing; recurrence or reminder phrases; project auto-creation; free-form grammar beyond the listed phrase classes.

## Decisions

### D1. Hand-written tokenizer and resolver, no NLP library
Chosen: a small module `web/src/lib/nlp/` with (a) a tokenizer that splits the line into words while respecting double quotes, (b) attribute matchers (`#`, `@`, `pN`, `+duration`), (c) a date/time grammar driven by per-language vocabulary tables (day words, weekday names and abbreviations, month names, "next", "in", "at", unit words), (d) a resolver that turns matches into a `Due` relative to a reference `Date`, and (e) a `parse(line, ctx)` function returning `{title, due, projectId, labels, priority, estimateMinutes, spans}`. The `spans` (character ranges per attribute) drive chips and dismissal.
- Why: chrono-style libraries weigh 30–90 KB gzipped, are English-first, and are non-deterministic across versions for our purposes. Our phrase classes are finite; a table-driven grammar is about 6–8 KB gzipped including six vocabularies and is easy to test exhaustively.
- Alternative considered: `Intl` APIs for weekday/month names. Rejected for parsing (output varies by engine and locale data); `Intl` remains fine for display.

### D2. Resolution rules
Reference date is the viewer's local calendar date (`todayISO()`), reference time the local wall clock. Rules: bare weekday = next occurrence after today; "next <weekday>" = same as bare weekday, except when the bare weekday would be in the current week (Mon–Sun) it means the following week; "in N days" = today + N; numeric date without year = next occurrence today or later; a time alone = today (even if already past, since the user said so); 12-hour times default to pm only when "pm" is written. Ambiguous day/month order follows the first active language (en-US: M/D, others: D/M), overridable in Settings. These rules are documented in `docs/quick-add.md` so users can predict them.

### D3. Precedence and conflicts
Left-to-right, first match of each attribute wins; a second date phrase is left in the title. Explicit tokens override view defaults; the view default fills only what the line did not set. Quoted text is never matched. A dismissed span is remembered as `{start, end, text}` and is skipped while the text at that span is unchanged.

### D4. Language set
`navigator.languages` filtered to bundled vocabularies, English appended; stored override in Settings (`localStorage`, per device). All active languages are matched simultaneously; collisions are resolved by ordering vocabularies in the user's preference order and taking the longest match. Known collisions (e.g. "mar" = Tuesday in Spanish vs March abbreviation in English) are decided by the longest-match rule plus requiring month abbreviations to be followed by a day number.

### D5. Data model impact: `estimate_minutes`
Additive task field: op kind "nullable positive integer" (new `kPositiveInt` kind), default `null`. Added to `Schema` in `internal/sync/ops.go`, `TASK_FIELDS`/`Task` in `web/src/lib/types.ts`, `TASK_DEFAULTS` in `web/src/lib/ops.ts`, the REST field allowlist (inherits from the schema) and the export (inherits from `fields`). No migration: fields are rows in the existing `fields` table. Older clients already tolerate unknown fields (they are stored in the row as-is); the server rejects the field only for clients older than this change, which only matters during a rolling upgrade and resolves once the server is updated. No op field is renamed. All writes go through `mutate()` / `Apply` as before.

### D6. UI
Chips render beneath the input in a single row (`role="status"`, `aria-live="polite"`); each chip has a dismiss button; Backspace-at-end highlights then dismisses the last chip (Gmail-recipient pattern). `TaskRow` shows `estimate_minutes` as a muted `45m` chip. Settings gets "Parse natural language in quick add" and a languages selector and the day/month order; all per device.

### D7. Dependency, size and memory
No new dependency. Bundle +6–8 KB gzipped. Server binary unchanged in size; container image and runtime memory unaffected.

## Risks / Trade-offs

- [False positives on ordinary words ("may", "march", "mar")] → month names need a following day number; chips make every interpretation visible; dismissal and quoting are one keystroke away; per-device off switch.
- [Users in one language typing another] → all active languages match at once; English always on.
- [Day/month ambiguity in numeric dates] → follows first active language, overridable; the chip always shows the resolved date in words.
- [Two devices with different local dates at midnight] → the parse is deterministic per device; the created op carries the resolved date, so other devices never re-parse.
- [Rolling upgrade where a new client writes `estimate_minutes` to an old server] → the batch is rejected with `invalid_op` and retried after the server is updated; ops stay in the outbox, nothing is lost. Documented in CHANGELOG as "update the server first".
- [Grammar growth] → scope is fixed to the listed phrase classes; recurrence and reminders have their own changes.

## Migration Plan

Deploy server (schema accepts the new field), then clients (automatic PWA update). Rollback: redeploy the previous server; already-stored `estimate_minutes` ops remain in the log and are simply unknown to older code paths (ignored by List/Get, still exported).

## Open Questions

- Whether `labels` typed via `@` should be validated against known labels once the `labels` change ships (today any string is accepted).
- Whether to surface a "create project 'x'" chip for unknown `#` tokens in a follow-up.
