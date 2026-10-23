## ADDED Requirements

### Requirement: Sentences built from facts

Text that the app composes from several facts, such as the day page briefing, SHALL be translatable in every shipped language without gluing words.

- **Whole messages:** each fact SHALL be one whole message, with its numbers as plural arguments.
- **Joining:** facts SHALL be joined by the reader's language's own list pattern (in English with the serial comma).
- **Sentence start:** a fact that starts a sentence SHALL be shown with its first letter in upper case.
- **Data stays as written:** task titles and people's names SHALL be inserted as values and never translated.
- **No gendered words about a title:** a message SHALL NOT need to agree in gender with a task title, because a title has no grammatical gender.

The composed text SHALL be complete in every shipped catalog. It SHALL change language with the interface, without a reload, and SHALL work offline like every message.

#### Scenario: Italian
- **WHEN** the interface language is Italian and the same three facts stand out
- **THEN** the briefing reads "Oggi contano tre cose. Renew the passport è in ritardo di 2 giorni, venerdì è già al completo e Mia ha risposto su Boiler.", with the title and the name as written

#### Scenario: A fact first
- **WHEN** the first fact of the sentence is today's load
- **THEN** the sentence starts "Today holds 9h of work…", with a capital, in English, and "Oggi hai 9h di lavoro…" in Italian

#### Scenario: Language switched
- **WHEN** the user switches the language in Settings while Today is open
- **THEN** the briefing is shown in the new language at once, with the same facts
