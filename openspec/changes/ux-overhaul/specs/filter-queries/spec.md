# Spec Delta

## MODIFIED Requirements

### Requirement: Filter view
The client SHALL provide a Filter view opened with `g f`, from the sidebar's More group and from the Filters group's "New" action, using the page header (title "Filter", actions Save as filter and Help) with a query input, the usage hint shown while the input is empty and collapsible otherwise, the error or warning line, live results grouped by project with the standard task rows and keyboard navigation, and a per-device history of the last 20 distinct queries available with Up/Down in the input. Pressing Enter in the input moves focus to the first result; Escape returns to the input.

#### Scenario: Open and run a query
- **WHEN** the user presses `g f`, types `@work & due <= tomorrow & p1` and presses Enter
- **THEN** the matching tasks are grouped by project and the first result is selected

#### Scenario: History is local
- **WHEN** the user reloads the app on the same device and presses Up in the empty filter input
- **THEN** the previous query is recalled, and another device shows no history from this one

#### Scenario: Hint folds away
- **WHEN** the user has typed a query that returns results
- **THEN** the usage hint collapses to one line with a control to expand it, and the results start directly below the input
