# Spec Delta

## MODIFIED Requirements

### Requirement: OpenTodo identity is preserved
Emerald SHALL be the default accent, and the accent SHALL come from the fixed set of themes the user can choose. Neutrals SHALL remain the slate family in every theme. The light theme SHALL keep white cards, and the dark theme SHALL keep a slate-950 canvas. Primary actions, the focus ring and the current navigation item SHALL use the accent of the current theme.

#### Scenario: Primary button colour
- **WHEN** a primary button renders in the light theme with the default theme
- **THEN** its background is the emerald accent token and its label uses the on-accent text token

#### Scenario: Focus ring
- **WHEN** any interactive control receives keyboard focus
- **THEN** a visible focus ring in the accent colour appears, at least 2 px wide and offset from the control

#### Scenario: Another theme keeps the neutrals
- **WHEN** the theme is `indigo`
- **THEN** primary buttons, the focus ring and the current navigation item are indigo, while cards, canvas, text and borders use the same slate values as with emerald

### Requirement: Accessible contrast in both themes
Every text token SHALL reach a WCAG 2.2 contrast of at least 4.5:1 against every surface token it is allowed on, in both themes and for every accent theme. Non-text UI tokens (borders of inputs, focus ring, priority and palette solid steps) SHALL reach at least 3:1 against the surfaces they sit on. Text placed on a palette soft step SHALL reach 4.5:1.

#### Scenario: A token change breaks contrast
- **WHEN** a contributor changes the muted text token so that it falls to 4.2:1 on the canvas in dark mode
- **THEN** the contrast check in `make check` fails and names the token pair, theme and measured ratio

#### Scenario: Label chip readability
- **WHEN** a label chip renders with any palette hue's soft background and that hue's text step
- **THEN** the text contrast is at least 4.5:1 in light and in dark

#### Scenario: A new accent theme fails contrast
- **WHEN** a contributor adds or changes an accent theme so that its on-accent label reaches only 3.9:1 on the accent in light mode
- **THEN** the contrast check in `make check` fails and names the accent theme, mode, token pair and measured ratio
