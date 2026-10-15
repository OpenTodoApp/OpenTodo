# Spec Delta

## MODIFIED Requirements

### Requirement: Multi-language vocabulary
Date, time, recurrence and reminder vocabulary SHALL be bundled for English, German, French, Italian, Spanish and Portuguese, available with no network. The active set SHALL be the interface language (OpenSpec `localization`) when not `system`, then the browser's bundled preferred languages, with English always active, overridable in Settings on the device. Attribute tokens (`#`, `@`, `p1`–`p4`, `+`) SHALL be language-independent. The stored rule SHALL always be the canonical English form.

#### Scenario: German phrase
- **WHEN** the browser language is `de` and the user enters `Zahnarzt nächsten Mittwoch um 15 Uhr`
- **THEN** the task is due next Wednesday at `15:00` with title `Zahnarzt`

#### Scenario: English always works
- **WHEN** the browser language is `it` and the user enters `Pay rent tomorrow`
- **THEN** the task is due tomorrow with title `Pay rent`

#### Scenario: Unsupported language falls back
- **WHEN** the browser language is one with no bundled vocabulary
- **THEN** English vocabulary is active, attribute tokens still work, and no error is shown

#### Scenario: Interface language comes first
- **WHEN** the browser language is `en-US`, the interface language is Spanish and the device has no language override
- **THEN** the active languages are Spanish then English, `Pagar alquiler mañana` is due tomorrow, numeric dates read day-month while the date format is `system`, and dictation listens in Spanish

#### Scenario: Device override still wins
- **WHEN** the interface language is Spanish and the device's quick-add languages are set to German only
- **THEN** the active languages are German then English

#### Scenario: Recurrence in each language
- **WHEN** the user enters `jeden Montag`, `tous les lundis`, `ogni lunedì`, `cada lunes` or `toda segunda-feira` after a title, with that language active
- **THEN** the rule is `every monday` in every case

#### Scenario: French interval with completion
- **WHEN** the browser language is `fr` and the user enters `Changer le filtre tous les 3 jours après achèvement`
- **THEN** the rule is `every 3 days after completion` and the title is `Changer le filtre`

#### Scenario: Reminder in each language
- **WHEN** the user enters `rappelle-moi 30 min avant`, `ricordamelo 30 minuti prima`, `recuérdame 30 minutos antes` or `lembre-me 30 minutos antes` after a timed task, with that language active
- **THEN** a relative reminder with offset −30 minutes is created in every case
