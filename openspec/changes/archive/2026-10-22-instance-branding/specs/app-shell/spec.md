## MODIFIED Requirements

### Requirement: Page changes are announced

The browser tab title SHALL name the current page and the instance ("Today – OpenTodo", or "Today – Acme Tasks" when the owner named the instance, see `instance-branding`), following the page heading also when its text arrives later. A navigation the person started SHALL move focus to the new page's heading, except on the first load (including the start-view redirect), while a dialog, an overlay or the task panel holds focus, while a text field has it, and when the new page moved focus into itself. A "Skip to content" link SHALL be the first focusable element of the shell, shown while focused, and SHALL move focus to the page heading. This is presentation only and behaves the same offline.

#### Scenario: Navigating from the sidebar

- **WHEN** the user activates "Today" in the sidebar
- **THEN** the tab title is "Today – OpenTodo" and focus is on the page heading

#### Scenario: Branded instance

- **WHEN** the user activates "Today" on an instance the owner named "Acme Tasks"
- **THEN** the tab title is "Today – Acme Tasks"

#### Scenario: First load

- **WHEN** the app opens at its start view
- **THEN** focus is not moved

#### Scenario: A dialog holds focus

- **WHEN** a navigation happens while focus is in a dialog
- **THEN** focus stays in the dialog

#### Scenario: Skip link

- **WHEN** the user presses Tab on a fresh page and activates the first link
- **THEN** focus moves to the page heading

### Requirement: Sidebar header row
The top of the sidebar SHALL be one header row holding the instance's mark and name on the left (the brand mark and the wordmark "OpenTodo", or the owner's logo and name on a branded instance, see `instance-branding`) and the search and commands button on the right. The header row SHALL be a slot whose left part can be replaced by another control (the workspace control of `workspaces`) while the search button and everything below the row stay unchanged. On the icon rail the row SHALL show the mark alone, centred, with the instance's name as its tooltip and accessible name. The brand mark SHALL be the mono variant, so it follows the sidebar's text tone in both themes, and the wordmark SHALL be set in the interface typeface at the body size with the strong text tone. The header row SHALL be rendered from local data only and SHALL look the same offline.

#### Scenario: Header at rest
- **WHEN** a user opens the app on a 1280×800 screen in light and in dark
- **THEN** the sidebar starts with the brand mark at 24 px, the wordmark "OpenTodo" and the search button in one row of 40 px or less, the mark is drawn in the current text tone with the accent on its loop, and no tick-in-a-square image is anywhere in the sidebar

#### Scenario: Icon rail
- **WHEN** the user collapses the sidebar with `[`
- **THEN** the header row shows the mark alone at 24 px, hovering or focusing it reads "OpenTodo", and the search button moves to the footer as before

#### Scenario: Branded header
- **WHEN** the owner set a logo and the name "Acme Tasks"
- **THEN** the header row shows the logo at 24 px and "Acme Tasks" in place of the mark and the wordmark, and the rail's tooltip reads "Acme Tasks"

#### Scenario: Replaceable left part
- **WHEN** a later change renders another control in the header's left part
- **THEN** the search button keeps its place and shortcut, the primary destinations start at the same vertical position, and the sidebar's tests for the destinations, groups and footer pass unchanged
