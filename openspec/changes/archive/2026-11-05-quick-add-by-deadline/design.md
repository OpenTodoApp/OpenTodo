## Context

The quick-add grammar has `before` words ("on", "by", "due", "am", "bis", "entro", "até", …) that are swallowed with a following date phrase, and `deadlineWords` ("deadline", "Frist", "scadenza", …) that turn the following date into the deadline (deadlines D7). A deadline has no time, so after a deadline phrase a time stays in the title.

## Decisions

### D1. A separate `byWords` list, kept in `before` too

Each vocabulary gets `byWords`: English `by`, German `bis`, Italian `entro`, Portuguese `até`; French and Spanish none (`pour`, `para` mean "for" and stay due words). A by word directly before a date phrase makes the deadline, like a deadline word. The words stay in `before`, so when the deadline reading is refused (D2) they still go with the due date as before. `bis` and `até` are also "until" words inside a rule (`jeden Montag bis Juni`); a rule phrase is read from its first word and takes the end date with it, so it never reaches the deadline check and rules do not change.

### D2. A time turns `by` back into a due word

- `by <time>` (`call back by 5pm`): the time is a due time and `by` is removed with it. Before this change `by` stayed in the title. Only an explicit time counts (`5pm`, `17:00`, `noon`, `17 Uhr`), never a bare number: `Split by 3` stays as typed.
- `by <date> <time>` (`Pay tax by friday 5pm`, also with `at`): the whole phrase is a due date and time, as before this change. The deadline word rule (a time after `deadline friday` stays in the title) was considered and rejected for `by`: it would turn a line that today gives a precise due moment into a deadline plus a stray `5pm` in the title. Someone who writes a time means a moment, and only the due date can hold one. The deadline word keeps its rule: it is explicit.

### D3. Everything else follows the deadline word

First deadline phrase wins, the date resolves by the existing rules, the chip and the palette's Deadline row come from the `deadline` chip with no UI change, dismissing the chip keeps the words in the title, and a line with a due date and a by phrase gets both (`Pay tax tomorrow by friday` = `Pay tax tomorrow deadline friday`). `by tonight` is a deadline today (the evening flag is not set).

### D4. Two ports, one set of vectors

`internal/quickadd` reads `vocab.json`, written from the TypeScript vocabularies, so `byWords` reaches Go through it; `matchDeadlineAt` and the by-time match are ported line for line. The shared vectors now compare `deadline` when a case states it, and every rule above is a case in both runners.

## Data model

None: `deadline` is an existing field. No dependency, no size change worth reporting.

## Interface budget

No screen changes: the deadline chip and the palette's Deadline row already exist and appear whenever the parser sets a deadline.
