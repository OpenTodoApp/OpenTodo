## Why

Quick add reads `Install winter tires by March 31` exactly like `Install winter tires on March 31`: the task is scheduled for 31 March. Most people mean "no later than" when they write `by`, so they move the date to the deadline by hand (#890). The deadline word (`deadline March 31`) works, but nobody types it.

## What Changes

- In quick add, `by` directly before a date sets the task's deadline instead of its due date: `Install winter tires by March 31` → *Install winter tires*, deadline 31 March, no due date, with the deadline chip and the Deadline row in the palette.
- `on` and `due` keep setting the due date.
- `by` before a time is a due time with the word removed: `call back by 5pm` → *call back*, today at 17:00 (before, `by` stayed in the title).
- `by` before a date followed by a time stays a due date and time (`Pay tax by friday 5pm` → due Friday 17:00), because a deadline has no time.
- A due date and a `by` deadline combine like the deadline word: `Pay tax tomorrow by friday` → due tomorrow, deadline Friday.
- The same holds for the languages whose word clearly means "no later than": German `bis`, Italian `entro`, Portuguese `até`. French `pour` and Spanish `para` mean "for" and keep setting the due date.
- The web parser and its Go port (`internal/quickadd`, used by `ot add --natural` and the quick-add REST endpoint) change together, pinned by new shared vectors that also compare the deadline. The Obsidian plugin bundles the web parser and follows.

Not a breaking change: no op, field or environment variable changes.

## Capabilities

### Modified Capabilities

- `natural-language-capture`: the Deadline phrases requirement gains the `by` words.

## Impact

- `web/src/lib/nlp` (vocabularies, `matchDeadlineAt`, a `by`-time match), `internal/quickadd` (the same, and `vocab.json`), the shared vectors, `docs/quick-add.md`.
- No size impact worth reporting: a few lines and one vocabulary list per language.

Out of scope: a time on a deadline, and words such as "before" or "until" in titles. Advances issue #890 (no ROADMAP row).
