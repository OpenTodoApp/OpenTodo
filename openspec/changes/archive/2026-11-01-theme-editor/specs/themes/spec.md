## ADDED Requirements

### Requirement: Custom themes are synced per user
A user SHALL be able to keep up to 20 custom themes, each a theme document of at most 16 KB, stored as operations on the user's personal data so they reach all of that user's devices and no other user's. A custom theme SHALL be choosable for the side of its kind like a built-in theme. Creating, saving and deleting a custom theme SHALL work offline with effect at once and sync later. A theme's document SHALL be one value: concurrent saves of the same theme SHALL converge on the save with the greater timestamp. The server SHALL refuse a theme value that is not a valid theme document or is larger than 16 KB. The device SHALL refuse to create a 21st theme; themes created concurrently offline beyond 20 SHALL all be kept. Deleting a theme that is chosen for a side SHALL set that side back to its default in the same change, and undoing the deletion SHALL restore both. Custom themes SHALL be part of the JSON export and import. Custom themes SHALL NOT be end-to-end encrypted, and the documentation and the editor on an encrypted account SHALL say so.

#### Scenario: Make on the laptop, use on the phone
- **WHEN** the user saves a custom dark theme on a laptop and chooses it for the dark side
- **THEN** the phone shows the theme in its list and applies it in dark mode after sync

#### Scenario: Concurrent saves
- **WHEN** device A and device B, both offline, save different colours for the same custom theme and both sync
- **THEN** both devices end with the document saved with the greater timestamp

#### Scenario: Oversized value refused
- **WHEN** a client sends a theme value of 20 KB or one whose canvas is `url(x)`
- **THEN** the server refuses the op as invalid and no device receives it

#### Scenario: The 21st theme
- **WHEN** a user with 20 custom themes opens Settings › Appearance
- **THEN** New theme, Customise, Duplicate and Import are unavailable with a message saying to delete one first

#### Scenario: Delete the chosen theme
- **WHEN** the user deletes the custom theme chosen for the dark side
- **THEN** the dark side shows OpenTodo Dark at once, Undo restores the theme and the choice, and the other devices follow after sync

#### Scenario: Another account
- **WHEN** the user exports their data and imports it into a new account
- **THEN** the custom themes and the choices that point at them come along and apply in the new account

### Requirement: Themes saved with contrast warnings
A custom theme whose resolved tokens fail contrast pairs SHALL still be savable and choosable. Its card SHALL show that it has low contrast and how many pairs fail, and choosing it SHALL apply it as written. The high-contrast presentation SHALL override it as it overrides every theme.

#### Scenario: Low-contrast theme chosen
- **WHEN** the user saves a theme with two failing pairs and chooses it
- **THEN** the theme applies, its card reads "Low contrast · 2", and turning on high contrast replaces its colours
