# Spec Delta

## MODIFIED Requirements

### Requirement: Translation checks
The project's checks SHALL fail when a new user-facing string in the web app is not routed through the message layer (naming the file and line, with an allow-list for proper nouns, codes and samples), when a shipped catalog misses a message or holds one no longer used, when a message is malformed, or when a translation's placeholders differ from the source. The untranslated-string check SHALL also catch a prop value that reads as a phrase without any two-letter word (such as a placeholder "e.g. 45m, 1h30") and text assembled in a template literal under an object key a view shows (such as a group's `note`).

#### Scenario: Untranslated string
- **WHEN** a change adds a button labelled with a bare literal
- **THEN** the check fails and names the file and line

#### Scenario: Missing translation
- **WHEN** a change adds a message without its German entry
- **THEN** the catalog check fails and names the message and the language

#### Scenario: Placeholder mismatch
- **WHEN** a French entry drops the `{name}` placeholder of its source message
- **THEN** the catalog check fails and names the entry

#### Scenario: Assembled group note
- **WHEN** a change builds a list group's note as `${n} done`
- **THEN** the check fails and names the file and line

## ADDED Requirements

### Requirement: Interface lookups do not depend on the language
Code that finds an element of the interface (to focus it, or to test where focus is) SHALL identify it by a stable attribute, never by translated text, so every command works the same in every shipped language.

#### Scenario: Vim insert in German
- **WHEN** the language is German, the Vim layer is on and the user presses `i` on a task
- **THEN** the task panel opens with the caret at the end of the title

#### Scenario: Logbook count in Spanish
- **WHEN** the language is Spanish and the Completed view shows a day with two completed tasks
- **THEN** the day's note reads "2 hechas"
