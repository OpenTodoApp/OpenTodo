## ADDED Requirements

### Requirement: The Repeat field reads the user's languages
The task's Repeat field SHALL accept a rule written in the stored English grammar, in every interface language, and SHALL also accept a repeat phrase in the languages quick add reads on the device (the device's chosen quick-add languages, else the interface language and the browser's languages, English always), read with the same vocabulary and rules as quick add. Either way the canonical English rule SHALL be what is stored. A text SHALL be accepted only when all of it is one rule: a phrase with other words around it, a phrase with a start date, and a phrase the grammar cannot express SHALL be refused with the existing message and the previous rule kept. While a rule is typed in the user's language the preview of the next occurrences SHALL show as for an English rule. After a change the field SHALL show the stored rule, and the rule in words of the interface language SHALL show above the presets. Reading SHALL happen on the device, offline included, and the write SHALL be the ordinary rule edit, converging as it does.

#### Scenario: Dutch
- **WHEN** the interface language is Dutch and the user types `elke vrijdag` in a task's Repeat field and presses Enter
- **THEN** the task's rule is `every friday`, the field shows `every friday` and the line above reads "Elke week op vrijdag"

#### Scenario: After completion
- **WHEN** the interface language is Dutch and the user types `elke 3 dagen na voltooiing`
- **THEN** the preview shows the next three dates, and Enter stores `every 3 days after completion`

#### Scenario: English still works
- **WHEN** the interface language is German and the user types `every 2nd tuesday`
- **THEN** the rule is stored as `every 2nd tuesday`, as before

#### Scenario: Not a rule
- **WHEN** the user types `elke blursdag`, or `Filter vervangen elke vrijdag`, or `every day from monday`
- **THEN** the field says it is not a rule it understands, and the task keeps its previous rule

#### Scenario: A language that is not active
- **WHEN** the device reads only German and English and the user types `elke vrijdag`
- **THEN** the text is refused

#### Scenario: Offline
- **WHEN** the device is offline and the user types `jeden Montag` in the Repeat field
- **THEN** the rule `every monday` applies at once and is uploaded when the network returns
