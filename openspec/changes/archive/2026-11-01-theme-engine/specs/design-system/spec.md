## MODIFIED Requirements

### Requirement: OpenTodo identity is preserved
On the OpenTodo themes (OpenTodo Light and OpenTodo Dark, the defaults), emerald SHALL be the default accent, and the accent SHALL come from the fixed set of accent themes the user can choose or the custom accent. Neutrals SHALL remain one slate family in every accent theme, with low chroma so they read calm rather than blue. The light theme SHALL keep white cards on a near-white canvas, and the dark theme SHALL keep a near-black slate canvas that is lifted off pure black so that canvas, surface and raised surface are told apart by lightness alone. Primary actions, the focus ring and the current navigation item SHALL use the accent of the current theme. Another theme (`themes`) MAY replace these colours with its own, and SHALL still keep canvas, surface and raised surface told apart by lightness.

#### Scenario: Primary button colour
- **WHEN** a primary button renders in the light theme with the default theme
- **THEN** its background is the emerald accent token and its label uses the on-accent text token

#### Scenario: Focus ring
- **WHEN** any interactive control receives keyboard focus
- **THEN** a visible focus ring in the accent colour appears, at least 2 px wide and offset from the control

#### Scenario: Another theme keeps the neutrals
- **WHEN** the theme is `indigo`
- **THEN** primary buttons, the focus ring and the current navigation item are indigo, while cards, canvas, text and borders use the same slate values as with emerald

#### Scenario: Dark surfaces separate by lightness
- **WHEN** a card sits on the dark canvas and a popover opens over the card
- **THEN** canvas, card and popover are three distinct lightness steps of the same hue, each at least 0.04 apart in OKLCH lightness, and the card is still readable with its border removed

#### Scenario: A palette keeps the surface steps
- **WHEN** a dark palette theme is active and a popover opens over a card on the canvas
- **THEN** canvas, card and popover are distinct lightness steps at least 0.04 apart, in the palette's own hue

### Requirement: Accessible contrast in both themes
Every text token SHALL reach a WCAG 2.2 contrast of at least 4.5:1 against every surface token it is allowed on, in both themes, for every accent theme and for every theme document shipped with the app. Non-text UI tokens (borders of inputs, focus ring, priority and palette solid steps) SHALL reach at least 3:1 against the surfaces they sit on. Text placed on a palette soft step SHALL reach 4.5:1. The contrast check SHALL measure the value the browser renders: a token written as an OKLCH literal or as a mix SHALL be resolved, and a translucent token SHALL be composited over the surface of the pair before the ratio is taken. Derived accent and palette steps SHALL be measured for every accent and every hue, not only the declared values, and a theme's derived tokens SHALL be measured as the device derives them.

#### Scenario: A token change breaks contrast
- **WHEN** a contributor changes the muted text token so that it falls to 4.2:1 on the canvas in dark mode
- **THEN** the contrast check in `make check` fails and names the token pair, theme and measured ratio

#### Scenario: Label chip readability
- **WHEN** a label chip renders with any palette hue's soft background and that hue's text step
- **THEN** the text contrast is at least 4.5:1 in light and in dark

#### Scenario: A new accent theme fails contrast
- **WHEN** a contributor adds or changes an accent theme so that its on-accent label reaches only 3.9:1 on the accent in light mode
- **THEN** the contrast check in `make check` fails and names the accent theme, mode, token pair and measured ratio

#### Scenario: A derived step is measured
- **WHEN** an accent's soft text step is derived by a mix and that mix yields 4.1:1 on the accent's soft surface in dark mode
- **THEN** the contrast check fails naming the accent, the mode, the pair and the measured ratio, even though no value was written by hand

#### Scenario: A translucent border is measured over its surface
- **WHEN** the dark divider token is a translucent white
- **THEN** the check composites it over each surface it is allowed on and measures the result, and a divider that vanishes on the raised surface fails naming that surface

#### Scenario: A shipped theme's derived token is measured
- **WHEN** a shipped theme sets only seeds and its derived label chip text reaches 4.3:1
- **THEN** the contrast check fails naming the theme, the pair and the ratio

### Requirement: High-contrast and no-motion presentation
The tokens SHALL offer a high-contrast override (`data-contrast="high"` on the document root) in which surfaces are pure white or pure black, text reaches at least 7:1 on every surface it is allowed on, soft tints are replaced by outlines, and non-text UI reaches at least 3:1; and a no-motion attribute (`data-motion="none"`) that sets every transition and animation duration to zero. Both SHALL combine with any theme mode, accent and theme and SHALL be covered by the contrast check. Under the high-contrast override no theme's colours SHALL apply, whatever theme is chosen.

#### Scenario: Override in both modes
- **WHEN** the root carries `data-contrast="high"` in light mode and then in dark mode
- **THEN** the canvas is pure white with black text, then pure black with white text, and every allowed text and surface pair measures at least 7:1

#### Scenario: Override pair fails the check
- **WHEN** a contributor changes a high-contrast text token so a pair falls to 6:1
- **THEN** the contrast check in `make check` fails and names the pair, the override and the measured ratio

#### Scenario: No motion
- **WHEN** the root carries `data-motion="none"` and a task is completed
- **THEN** the row changes state with no transition or animation, as under the system's reduced-motion setting

#### Scenario: High contrast over a palette
- **WHEN** a palette theme is chosen and the root carries `data-contrast="high"`
- **THEN** every surface, text and accent token has the high-contrast value, the same as over OpenTodo's themes
