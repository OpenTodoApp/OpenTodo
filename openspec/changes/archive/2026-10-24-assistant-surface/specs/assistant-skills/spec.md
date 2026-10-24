## ADDED Requirements

### Requirement: Skills as starters
The Assistant page and the panel's empty state SHALL offer at most three skills as starter cards, in this order: `plan-week`, `triage-inbox`, `idea-to-project`, each with its name and description from the skill list. A skill the server does not list SHALL be left out, and no card SHALL be shown when the list is empty. Choosing a card SHALL choose that skill in the composer exactly as the Skills menu does. The cards need no request of their own and work from the cached skill list offline.

#### Scenario: The three starters
- **WHEN** the server lists all five built-in skills and the user opens the Assistant page with no conversation
- **THEN** the cards read Plan my week, Triage my inbox and Turn an idea into a project, in that order

#### Scenario: A skill missing from the list
- **WHEN** the skill list holds `idea-to-project`, `plan-week` and `weekly-review` only
- **THEN** two cards are shown, Plan my week then Turn an idea into a project

#### Scenario: Assistant unavailable
- **WHEN** the skill list is empty because the assistant is not available to the user
- **THEN** no starter card is shown
