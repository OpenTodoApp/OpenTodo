## ADDED Requirements

### Requirement: Keys of features that are off
A shortcut that opens or starts a feature the current workspace has off (`workspaces` "Workspace features") SHALL do nothing: the `g` keys of Notes, today's note, the Calendar views, Habits, Focus, Review, the Daily check, Close the day and Statistics, and `y` (Start or Stop tracking) with Time tracking off. The registry and the cheat sheet SHALL stay unchanged, so no key is reassigned and no conflict can appear.

#### Scenario: g f with Focus off
- **WHEN** the current workspace has Focus off and the user presses `g` then `f`
- **THEN** the page does not change

#### Scenario: y with Time tracking off
- **WHEN** the current workspace has Time tracking off and the user presses `y` on a selected task
- **THEN** no entry starts
