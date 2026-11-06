# Spec Delta

## ADDED Requirements

### Requirement: Display options from the keyboard
A project's list, a label's page and a saved view SHALL let the user change Group by, Order by and the direction from the keyboard (OpenSpec `keyboard-shortcuts`, "Group and order keys"), with the choices the page's panel offers except custom-field orders. A keyed change SHALL be the same change as the panel's: the same stored fields, one operation per changed field written locally first, offline and per-field convergence as in "Display options are stored per project and per label", personal on a shared project. Choosing the value already in effect SHALL write nothing.

#### Scenario: Same as the panel
- **WHEN** the user presses `r o t` on the label "errand" and then opens Display options
- **THEN** the panel shows Order by Title, the label's stored order is Title, and the phone lists the errands by title after it syncs

#### Scenario: Personal on a shared project
- **WHEN** Ana presses `r g d` in the shared project "Launch"
- **THEN** her list is grouped by due date and Ben still sees "Launch" by section

#### Scenario: Nothing to write
- **WHEN** a project is grouped by priority and the user presses `r g p`
- **THEN** no operation is queued and the notice reads "Group by: Priority"
