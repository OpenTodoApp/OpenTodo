# Proposal

## Why

Issue #1427, first half: a repeat rule is shown as it is stored, in English, in every interface language. A Dutch speaker who types `Filter vervangen elke 3 dagen na voltooiing` gets the right task, and its repeat then reads `every 3 days after completion`.

The rule is stored in one English grammar that sync, CalDAV, the importers and the agent tools share (`recurring-tasks` "Rule grammar"). That stays. What changes is how the rule reads on screen.

## What Changes

- **A rule is shown in the interface language**, wherever the web app shows one as text: the Repeat segment of a task's When popover, the task's facts line, the Repeats chip of quick add, and a proposed change's "repeat" line in the assistant's review. It is built from the parsed rule, so `every 2nd tuesday` reads "Every month on the second Tuesday" in English and "Jeden Monat am zweiten Dienstag" in German.
- **One wording.** The words are those of the Repeat presets ("Every week on Thursday", "Every month on day 15"), so a preset and the line above it read the same. The line no longer starts with "Repeats".
- **A rule this version cannot read is shown as stored**, as today.
- **Unchanged:** the stored rule, the grammar, what the Repeat field accepts and shows while it is edited (English), the server, sync, the CLI, CalDAV and the agent tools. No new op field, entity, route, setting, dependency or shortcut. Not **BREAKING**.

Out of scope: the Repeat field reading the interface language (the second half of #1427, its own change: it parses input); rule words in emails, the CLI, MCP results and the Markdown vault, which keep the stored rule.

Roadmap: a follow-up of `recurring-tasks` and `app-localization`; listed in the 0.20 table as `repeat-rule-words`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `recurring-tasks`: new requirement "A rule reads in the interface language"; "Repeat presets" names the line in the presets' wording.

## Impact

- Web: `web/src/lib/recurrenceWords.ts` (new, `ruleWords`), used by `web/src/app/task-detail/WhenControl.tsx`, `web/src/lib/facets.ts`, `web/src/app/ParseChips.tsx` and `web/src/lib/assistant.ts`.
- Catalogues: 13 new messages in every language, "Repeats {rule}" goes; `make i18n-check`.
- Docs: `docs/recurrence.md`; `changelog.d/Changed/repeat-rule-words.md`.
- Tests: `web/src/lib/recurrenceWords.test.ts` (every kind of rule, every rule of the shared vectors, eight languages); the Repeat segment and quick-add chip tests read the new words.
- Size: one small module on the first load (the facts line is there); the first-load budget is not raised.
