# Spec Delta

## MODIFIED Requirements

### Requirement: Responsive layout and themes
The layout SHALL work from 360 px wide phones to desktops, with a collapsible sidebar on small screens. It SHALL be light or dark according to the user's appearance mode, which follows the system light or dark preference by default.

#### Scenario: Phone layout
- **WHEN** the viewport is narrower than 768 px
- **THEN** the sidebar is hidden behind a menu button and the task list uses the full width

#### Scenario: Mode overrides the system
- **WHEN** the system prefers light and the user's appearance mode is `dark`
- **THEN** the app renders dark on phones and desktops alike
