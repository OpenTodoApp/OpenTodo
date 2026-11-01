## ADDED Requirements

### Requirement: A long panel title shows its start after editing
The panel title field is a two-line textarea that scrolls inside itself while a title longer than two lines is edited. When it loses focus and commits the edit, the field SHALL scroll back to the start of the title, so the beginning is visible instead of the end where the caret was. The one-line inline title editor SHALL keep its current behaviour.

#### Scenario: Leaving a long panel title
- **WHEN** the user edits a panel title long enough to scroll the field and then leaves it by clicking elsewhere or pressing Enter
- **THEN** the field shows the beginning of the title, not the line it was scrolled to
