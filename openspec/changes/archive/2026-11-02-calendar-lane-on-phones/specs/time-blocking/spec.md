## ADDED Requirements

### Requirement: Unscheduled lane on a touch screen
On a touch screen, or in a window narrower than 768 px, a Day or Week grid lane holding more than three items SHALL fold behind a header that names the lane Unscheduled and shows its number of items, folded by default. Activating the header SHALL show or fold the lane's rows, and the choice SHALL be kept on this device only, never synced, apply to every day's lane and survive reloads, offline included; after a choice to fold, every non-empty lane SHALL fold. While the keyboard selection is a task of a folded lane, that lane SHALL show its rows. A folded lane SHALL remain the lane's drop target. The all-day strips and lanes SHALL scroll inside one region of the sticky header no taller than three and a half rows or a quarter of the screen, so the hour grid keeps most of the screen. With a mouse in a window of 768 px or more the lane SHALL show every row as before. At every width the now line, ghosts and overlap lists of the hour grid SHALL stay below the sticky header and never paint over the all-day strips or lanes.

#### Scenario: Seven tasks on a phone
- **WHEN** a phone shows today's Day with seven date-only tasks and no stored choice
- **THEN** the lane shows one header "Unscheduled 7" and no rows, and the hour grid fills the rest of the screen

#### Scenario: Opened and remembered
- **WHEN** the person taps the header and reloads the Calendar on the same phone
- **THEN** the rows show in a region that scrolls after three and a half rows, and the header folds them again on a tap

#### Scenario: Dropping on a folded lane
- **WHEN** a block is dragged onto a folded lane's header
- **THEN** the task keeps its date and loses its time, as on an open lane

#### Scenario: Now line under the header
- **WHEN** the grid is scrolled so the current time is under the sticky header
- **THEN** the now line is hidden behind the header and does not cross the lane

#### Scenario: Desktop unchanged
- **WHEN** a desktop with a mouse shows a Day with seven date-only tasks
- **THEN** the lane lists all seven rows with no header, as before
