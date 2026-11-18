# Proposal

## Why

Issue #1427, second half: a task's Repeat field only takes the stored English grammar. Quick add reads `Filter vervangen elke vrijdag` in Dutch and makes the right repeating task, but editing that task's repetition accepts `every friday` and refuses `elke vrijdag`. The first half (`repeat-rule-words`) made the app show a rule in the interface language; the field should read what quick add reads.

## What Changes

- **The Repeat field reads the user's languages.** A rule typed in the field is read as the stored English grammar first and, when that fails, as a repeat phrase in the languages quick add reads on this device (the interface language, the browser's languages or the device's chosen list; English always). "elke vrijdag", "jeden zweiten Dienstag im Monat", "tous les 3 jours après achèvement", "daily" and "every other week" are accepted. What is stored is the canonical English rule, as before.
- **The whole text must be the rule.** Words around a phrase, a start date ("every day from Monday") or a phrase the grammar cannot express are refused as today, and the previous rule is kept.
- **The preview follows.** The next three dates show while a phrase in the user's language is typed.
- **The field shows the stored rule** after a change; the line above it shows the rule in the interface language (`repeat-rule-words`). The placeholder's example is in the user's language when the field reads it back.
- **Unchanged:** the stored rule and grammar, quick add, its vocabularies and their Go port, the server, sync, CalDAV, the CLI, the agent tools. No new op field, entity, route, setting, dependency, shortcut or message. Not **BREAKING**.

Out of scope: showing the translated sentence as the field's value (the sentences of `repeat-rule-words` are not all phrases quick add reads, so the field could show text it then refuses); new vocabulary; Russian and Chinese phrases (quick add has no vocabulary for them; the English grammar works there as before).

Roadmap: a follow-up of `repeat-rule-words` and `quick-add-recurrence`; listed in the 0.20 table as `repeat-field-language`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `recurring-tasks`: new requirement "The Repeat field reads the user's languages".

## Impact

- Web: `web/src/lib/nlp/repeatPhrase.ts` (new, `ruleFromText`), `web/src/app/RecurrenceField.tsx`.
- Docs: `docs/recurrence.md`; `changelog.d/Changed/repeat-field-language.md`.
- Tests: `web/src/lib/nlp/repeatPhrase.test.ts`, a Dutch interaction case in `web/src/app/task-detail/whenControl.test.tsx`.
- Size: about 30 lines; the quick-add parser it calls is already loaded with the app. The first-load budget is not raised.
