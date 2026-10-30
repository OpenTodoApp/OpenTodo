# Spec Delta

## ADDED Requirements

### Requirement: Part of the day phrases
While the user's Day parts preference (OpenSpec `day-parts`) is on, the parser SHALL recognise `this morning` and `this afternoon`, which make the task due today with that part, and a part word (`morning`, `afternoon`, `evening`) directly after a date phrase, which sets that date with that part (Evening as the evening flag), each with its bundled equivalents in every active language (en, de, fr, it, es, pt). A part word anywhere else SHALL stay in the title. While the preference is off these phrases SHALL not be parsed; `tonight` and `this evening` SHALL keep their meaning in every mode. A time still sets the due time. Each SHALL show a dismissable chip. The TypeScript parser and the Go port SHALL agree on shared vectors, and `POST /api/v1/quick-add/parse` SHALL accept an optional `day_parts` boolean (default false) that turns the phrases on.

#### Scenario: Tomorrow morning
- **WHEN** day parts are on and the user enters `Stretch tomorrow morning` on 2026-10-14
- **THEN** the task is titled `Stretch`, due 2026-10-15 with the part Morning, and a Morning chip is shown

#### Scenario: Title word stays literal
- **WHEN** day parts are on and the user enters `Morning run tomorrow`
- **THEN** the task is titled `Morning run`, due tomorrow, with no part

#### Scenario: German afternoon
- **WHEN** German is active, day parts are on and the user enters `Einkaufen heute Nachmittag`
- **THEN** the task is due today with the part Afternoon and titled `Einkaufen`

#### Scenario: Preference off
- **WHEN** day parts are off and the user enters `Call Ana this morning`
- **THEN** the task is titled `Call Ana this morning` with no date and no part
