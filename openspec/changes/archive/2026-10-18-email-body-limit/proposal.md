## Why

Email to task cuts a message's text at 16 KB and appends "[Message truncated: the text was longer than 16 KB]" (issue #161). Long newsletters, threads and reports lose most of their content, although a task's notes hold far more: a synced string value may be up to 64 KB (`sync.MaxValueBytes`), and people already paste more than 16 KB into notes by hand. The 16 KB figure was an arbitrary safety margin, not a limit of the data model.

## What Changes

- The task description keeps as much of the message text as fits in one synced value: the description (text, note and attachment list) is cut at the longest character boundary whose JSON encoding stays within `sync.MaxValueBytes`, measured with the same encoder that writes the operation, and whose ciphertext would still fit (an end-to-end encrypted account's devices re-encrypt the description: "enc:v1:" + base64url adds about a third). That is about 48 KB of text, three times the old limit. Text that fits is never cut.
- The note at the cut says the rest did not fit: "[Message truncated: the rest did not fit in the task's notes]".
- The Email to task guide states the new limit (about 48 KB of text).

Out of scope: the share target's 16 KB text limit (`share-capture`), the 10 MB message limit, the title limit, and the attachment list. No new field, route, environment variable or migration; the operation format is unchanged.

Advances the ROADMAP item `email-capture` (issue #161).

## Impact

`internal/email/parse.go` (`description`, the note), `internal/email/parse_test.go`, `docs/email.md`, CHANGELOG. No dependency, no web change.
