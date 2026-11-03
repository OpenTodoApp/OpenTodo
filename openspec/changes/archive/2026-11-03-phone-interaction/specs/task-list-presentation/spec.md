## MODIFIED Requirements

### Requirement: Quick add stays reachable in long lists
From 768 px wide, except on a phone held in landscape (a coarse pointer under 500 px tall), wherever the floating Add button is not shown, a list page's quick add SHALL stay visible directly under the page header while the list scrolls under it, on the page surface with its bottom border, so a new task can be added at any scroll position without scrolling back up. It SHALL be the same row as before, not an extra one, and SHALL never cover a focused row, the selection bar or a toast; focused rows SHALL scroll into view below it, counting it only while it is pinned. Below 768 px, and on a landscape phone, the quick add SHALL scroll with the list as before, the floating Add button being the always reachable add control. Section add rows and board columns SHALL NOT stick. This is presentation only and behaves the same offline.

#### Scenario: Add after scrolling down
- **WHEN** on a 1280 × 800 window the user scrolls a project with 80 tasks to its end
- **THEN** the quick add is still visible under the page header, and clicking it and adding a task needs no scroll

#### Scenario: Focused row not covered
- **WHEN** the list is scrolled and the user moves the focus with `k` to a row just under the stuck quick add
- **THEN** the row scrolls so that it is fully visible below the quick add

#### Scenario: Phone unchanged
- **WHEN** the same project is scrolled on a 390 × 844 screen
- **THEN** the quick add scrolls away with the list and the floating Add button stays visible

#### Scenario: Landscape phone leaves it unpinned
- **WHEN** the same project is scrolled on an 844 × 390 phone held in landscape
- **THEN** the quick add scrolls with the list, the page header takes only its own height, and the floating Add button is the way to add a task
