## MODIFIED Requirements

### Requirement: Group and order keys
In a project's list (List layout), on a label's page, in a saved view, and on Today, Upcoming and the Inbox, the client SHALL offer key sequences that change the list's Display options: `r g` followed by `s` (Section), `j` (Project), `n` (None), `d` (Due date), `p` (Priority), `l` (Label) or `t` (Time of day) SHALL set Group by; `r o` followed by `m` (Manual order), `p` (Priority), `d` (Due date), `c` (Created), `l` (Deadline) or `t` (Title) SHALL set Order by; `r r` SHALL switch the direction between ascending and descending. A sequence SHALL work only where the page's panel offers that choice and SHALL do nothing elsewhere, including the New view page and a project's board, timeline and calendar layouts: `r g` does nothing on Upcoming, `r g t` works only on Today, and `r o m` does nothing on Today and Upcoming. The keys SHALL write the same setting as the panel, through the same operations, so the change works offline, reaches the user's other devices with sync and converges by last-writer-wins per field. After each sequence the client SHALL show a notice with the setting now in effect, in the panel's words, in a live region read by screen readers. The keys SHALL NOT fire while a text field has focus, SHALL NOT fire while single-key shortcuts are turned off, and SHALL keep working with Vim keybindings on. The `?` sheet and the keyboard guide SHALL list them under "Group and order", generated from the registry.

#### Scenario: Group a project by priority
- **WHEN** the user presses `r`, `g`, `p` in the list of the project "Home"
- **THEN** the list is grouped by priority, the notice reads "Group by: Priority", and the project's stored grouping is Priority, as if chosen in the panel

#### Scenario: Order, then reverse
- **WHEN** the user presses `r o p` and then `r r` in a saved view, before the list has redrawn
- **THEN** the view is ordered by priority, descending, with priority 1 first, and the notice reads "Order by: Priority · Descending (p1 first)"

#### Scenario: A choice the page does not offer
- **WHEN** the user presses `r g s` on a label's page
- **THEN** nothing changes and nothing is announced, and `r g j` groups the page by project

#### Scenario: Offline
- **WHEN** the device is offline and the user presses `r g d` in a project
- **THEN** the list is grouped by due date at once, the change is queued, and the user's other devices show the same grouping after they sync

#### Scenario: While typing
- **WHEN** focus is in the quick add field and the user types `rgp`
- **THEN** the letters are typed and the grouping is unchanged

#### Scenario: With Vim keybindings
- **WHEN** Vim keybindings are on and the user presses `r o d` in a project
- **THEN** the list is ordered by due date, and no quick add opens and nothing is deleted

#### Scenario: Elsewhere
- **WHEN** the user presses `r g p` on the New view page or on a project's board
- **THEN** nothing happens

#### Scenario: Today
- **WHEN** the user presses `r g p` on Today and then `r g t`
- **THEN** Today is grouped by priority with the notice "Group by: Priority", then back by time of day with the notice "Group by: Time of day"

#### Scenario: Upcoming has no grouping
- **WHEN** the user presses `r g p` on Upcoming
- **THEN** nothing happens, and `r o p` orders each day by priority
