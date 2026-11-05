## MODIFIED Requirements

### Requirement: Sidebar header row
The top of the sidebar SHALL be one header row holding the instance's mark and name on the left (the brand mark and the wordmark "OpenTodo", or the owner's logo and name on a branded instance, see `instance-branding`) and the search and commands button on the right. The header row SHALL be a slot whose left part can be replaced by another control (the workspace control of `workspaces`) while the search button and everything below the row stay unchanged. On the icon rail the row SHALL show the mark alone, centred, with the instance's name as its tooltip and accessible name. The brand mark SHALL be the mono variant, so it follows the sidebar's text tone in both themes, and the wordmark SHALL be set in the interface typeface at the body size with the strong text tone. The header row SHALL be rendered from local data only and SHALL look the same offline.

#### Scenario: Header at rest
- **WHEN** a user opens the app on a 1280×800 screen in light and in dark
- **THEN** the sidebar starts with the brand mark at 24 px, the wordmark "OpenTodo" and the search button in one row of 40 px or less, the mark's tray is drawn in the current text tone with the accent on its tick, and no tick-in-a-square image is anywhere in the sidebar

#### Scenario: Icon rail
- **WHEN** the user collapses the sidebar with `[`
- **THEN** the header row shows the mark alone at 24 px, hovering or focusing it reads "OpenTodo", and the search button moves to the footer as before

#### Scenario: Branded header
- **WHEN** the owner set a logo and the name "Acme Tasks"
- **THEN** the header row shows the logo at 24 px and "Acme Tasks" in place of the mark and the wordmark, and the rail's tooltip reads "Acme Tasks"

#### Scenario: Replaceable left part
- **WHEN** a later change renders another control in the header's left part
- **THEN** the search button keeps its place and shortcut, the primary destinations start at the same vertical position, and the sidebar's tests for the destinations, groups and footer pass unchanged
