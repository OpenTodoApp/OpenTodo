## ADDED Requirements

### Requirement: Go keys choose the sidebar space
The go sequences SHALL show the sidebar space of the screen they open (`app-shell` "Sidebar spaces"): `g e` SHALL open Notes and show the Notes space, and every `g` sequence that opens a task screen (Inbox, Today, Upcoming, the calendar, a method view, Labels, Views, All projects and the others) SHALL show the Tasks space; `g s`, `g ?` and the other sequences that open a neutral screen SHALL keep the space as it was. No key SHALL be added or moved for the spaces: `g n` stays Go to Anytime. The `?` sheet and the keyboard guide SHALL describe `g e` as opening Notes with the Notes sidebar, generated from the registry. The space is device state, so the keys work offline and nothing is sent or converged.

#### Scenario: Into notes and back
- **WHEN** the user in Today presses `g e`, then `g t`
- **THEN** Notes opens with the Notes space in the sidebar, then Today opens with the Tasks space

#### Scenario: Settings in between
- **WHEN** the user in the Notes space presses `g s`
- **THEN** Settings opens and the sidebar still shows the Notes space

#### Scenario: Anytime keeps its key
- **WHEN** the user presses `g n`
- **THEN** Anytime opens with the Tasks space, as before this change
