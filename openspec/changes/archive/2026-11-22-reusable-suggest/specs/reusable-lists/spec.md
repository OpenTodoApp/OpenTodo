## ADDED Requirements

### Requirement: Ticked items are suggested while typing
In a reusable list's quick add, typing two or more characters SHALL list the list's ticked top-level items whose name contains what was typed, with the name matching of an add (case, accents and spaces at the ends ignored), the most recently ticked first, at most eight, while no token suggestion is open. No item SHALL be chosen until an arrow key moves into the list, so Enter SHALL still add what was typed. Enter on a chosen item, or a click, SHALL add it by its exact name, which reopens it as "Adding an existing item reopens it" says, and clears the field; Esc SHALL close the list and keep the text. Open items, items of other projects and other projects' quick add SHALL get no suggestions. It SHALL work offline, from the device's own rows.

#### Scenario: A few letters bring an item back
- **WHEN** "Milk" and "Oat milk" are ticked in Groceries, "Oat milk" last, and the person types "mil" in its quick add, presses ↓ and Enter
- **THEN** the list showed "Oat milk" then "Milk", "Oat milk" is reopened in its place with "Oat milk is back on the list" and Undo, and the field is empty

#### Scenario: Enter alone still adds
- **WHEN** the person types "mil" and presses Enter without moving into the list
- **THEN** a new item "mil" is added, as before

#### Scenario: An ordinary project
- **WHEN** the person types "mil" in the quick add of a project that is not a reusable list
- **THEN** no ticked items are suggested
