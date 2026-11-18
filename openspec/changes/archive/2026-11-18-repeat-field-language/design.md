# Design

## Context

- `RecurrenceField` (`web/src/app/RecurrenceField.tsx`) passes the typed text to `setRecurrence`, which accepts only what `parseRule` (`web/src/lib/recurrence.ts`) accepts: the stored English grammar.
- Quick add already translates a repeat phrase in the user's languages into that grammar: `matchRecurrenceAt` (`web/src/lib/nlp/recurrence.ts`) over the tokens of a line, with the vocabularies of `web/src/lib/nlp/vocab` (nine languages), and it only ever returns a rule `parseRule` accepts.
- The languages quick add reads on a device come from `resolveLanguages(loadQuickAddSettings(), preferredLanguages())`: the device's chosen list, else the interface language and the browser's languages; English is always active.

## Decisions

**D1. One function: `ruleFromText(text, ctx)`.** It returns the canonical rule the text means, or null:
1. `parseRule(text)`: the stored grammar, in every language, exactly as before.
2. Otherwise the text is tokenized as a quick-add line and `matchRecurrenceAt` is asked for the phrase at the first token, with the same vocabularies, day-month order and week start as quick add.
3. The match counts only when it covers every token, is not a literal ("every 2 Mondays") and carries no start date. The rule is passed through `parseRule` once more and its canonical form returned.

So the field accepts exactly: the stored grammar, plus what quick add would have made of the same words alone on a line. No new grammar, no new vocabulary, and nothing the server would refuse.

**D2. A start date is refused.** "every day from Monday" sets the due date in quick add. The Repeat field changes the rule only; silently dropping the date would be a surprise, and moving the due date from this field is another change.

**D3. The field shows the stored rule.** After a change the field holds the canonical English rule, and the line above the presets holds the sentence in the interface language. The sentences of `repeat-rule-words` are not all phrases quick add reads (about half read back in the western languages, none in Russian or Chinese, measured over the shared vectors), so showing them in the field would offer text it then refuses. The placeholder's example is the sentence for `every weekday` when `ruleFromText` reads it back in the active languages, else the English.

**D4. The same resolution for the preview and the write.** The field computes `ruleFromText` once per text; the preview parses its result, and Enter or blur writes it through `setRecurrence`, which checks it again. A text that is no rule goes to `setRecurrence` as typed, so the refusal and its message are the existing ones.

## Data model

None.

## Interface budget

No new control, row, property or shortcut; an existing field reads more (`docs/interface-guide.md`).

## Security

The field parses typed text with the parser quick add already runs on typed text; the output is restricted to rules `parseRule` accepts, and the write path (`setRecurrence` → `mutate`) is unchanged.

## Size

`repeatPhrase.ts` is about 30 lines. `RecurrenceField` now imports `lib/nlp`, which the app shell already loads for quick add; `make bundle-budget` stays inside the budget.
