# Spec Delta

## MODIFIED Requirements

### Requirement: Accessible contrast in both themes
Every text token SHALL reach a WCAG 2.2 contrast of at least 7:1 against every surface token it is allowed on, in both themes and for every accent theme, except the pairs named in the accessibility exceptions register (OpenSpec `accessibility`), which SHALL reach at least 4.5:1 and SHALL be the only text pairs allowed below 7:1. Non-text UI tokens (borders of inputs, focus ring, priority and palette solid steps) SHALL reach at least 3:1 against the surfaces they sit on. Text placed on a palette soft step SHALL reach 7:1 where the hue allows it and never less than 4.5:1; a hue below 7:1 is a register entry. The contrast check SHALL measure the value the browser renders: a token written as an OKLCH literal or as a mix SHALL be resolved, and a translucent token SHALL be composited over the surface of the pair before the ratio is taken. Derived accent and palette steps SHALL be measured for every accent and every hue, not only the declared values. The three text tones (default, muted, faint) SHALL stay three visibly distinct steps, at least 0.04 apart in OKLCH lightness.

#### Scenario: A token change breaks contrast
- **WHEN** a contributor changes the muted text token so that it falls to 6.6:1 on the canvas in light mode
- **THEN** the contrast check in `make check` fails and names the token pair, theme and measured ratio

#### Scenario: Label chip readability
- **WHEN** a label chip renders with any palette hue's soft background and that hue's text step
- **THEN** the text contrast is at least 7:1 in light and in dark, or the hue is a register entry at no less than 4.5:1

#### Scenario: A new accent theme fails contrast
- **WHEN** a contributor adds or changes an accent theme so that its on-accent label reaches only 3.9:1 on the accent in light mode
- **THEN** the contrast check in `make check` fails and names the accent theme, mode, token pair and measured ratio

#### Scenario: A derived step is measured
- **WHEN** an accent's soft text step is derived by a mix and that mix yields 4.1:1 on the accent's soft surface in dark mode
- **THEN** the contrast check fails naming the accent, the mode, the pair and the measured ratio, even though no value was written by hand

#### Scenario: A translucent border is measured over its surface
- **WHEN** the dark divider token is a translucent white
- **THEN** the check composites it over each surface it is allowed on and measures the result, and a divider that vanishes on the raised surface fails naming that surface

#### Scenario: A registered pair
- **WHEN** the faint tone measures 5.3:1 on the canvas in light and the register names that pair
- **THEN** the contrast check passes the pair at its registered minimum of 4.5:1 and fails if it falls below

#### Scenario: Lowering a minimum without the register
- **WHEN** a contributor lowers a text pair's minimum in the pair list without a register entry
- **THEN** the contrast check fails naming the pair

#### Scenario: Tones stay distinct
- **WHEN** the muted tone is retuned to 7:1 in light
- **THEN** the faint tone still differs from it by at least 0.04 in OKLCH lightness, and the default tone from the muted one

### Requirement: High-contrast and no-motion presentation
The tokens SHALL offer a high-contrast override (`data-contrast="high"` on the document root) in which surfaces are pure white or pure black, every text pair reaches at least 7:1 including the on-accent label of the primary button and the text of every palette soft step, soft tints are replaced by outlines, and non-text UI reaches at least 3:1; and a no-motion attribute (`data-motion="none"`) that sets every transition and animation duration to zero. Both SHALL combine with any theme mode and accent and SHALL be covered by the contrast check. The root SHALL carry the high-contrast override when the person's contrast preference is `high`, or when it is `auto` and the system asks for more contrast; it SHALL carry the no-motion attribute when the motion preference is `none` (OpenSpec `appearance-preferences`). A display route's options (OpenSpec `display-mode`) keep setting the same attributes.

#### Scenario: Override in both modes
- **WHEN** the root carries `data-contrast="high"` in light mode and then in dark mode
- **THEN** the canvas is pure white with black text, then pure black with white text, and every allowed text and surface pair measures at least 7:1

#### Scenario: Override pair fails the check
- **WHEN** a contributor changes a high-contrast text token so a pair falls to 6:1
- **THEN** the contrast check in `make check` fails and names the pair, the override and the measured ratio

#### Scenario: Primary button in high contrast
- **WHEN** the root carries `data-contrast="high"` and a primary button renders with the emerald accent
- **THEN** its label measures at least 7:1 on the button, in light and in dark

#### Scenario: No motion
- **WHEN** the root carries `data-motion="none"` and a task is completed
- **THEN** the row changes state with no transition or animation, as under the system's reduced-motion setting

#### Scenario: System asks for more contrast
- **WHEN** the person's contrast preference is `auto` and the operating system's "increase contrast" setting is on
- **THEN** the root carries the high-contrast override from the first paint, and turning the system setting off removes it without a reload

### Requirement: Accessibility gate on stories
CI SHALL run an automated accessibility audit on every workbench story in light and dark with the WCAG 2.2 A, AA and AAA rule sets. It SHALL fail on any serious or critical violation, except an enhanced-contrast finding whose colours resolve to a pair in the accessibility exceptions register, which passes (OpenSpec `accessibility`, "Automated AAA gate").

#### Scenario: Button without an accessible name
- **WHEN** a story renders an icon-only button without an accessible name
- **THEN** the UI check fails and names the story, theme and rule

#### Scenario: Enhanced contrast on an unregistered pair
- **WHEN** a story renders a caption whose colours measure 5.0:1 and no register entry names that pair
- **THEN** the UI check fails and names the story, the theme, the element and the ratio

### Requirement: Focus visibility in the accessibility gate
The accessibility gate on stories SHALL, for every core-screen story, move keyboard focus through every focusable element and SHALL fail when an element receives focus without the token focus ring becoming visible, or when the focused element is partly outside the viewport or covered at any corner or its centre by an element that is not itself, one of its descendants or an overlay it opened (OpenSpec `accessibility`, "Focus is never obscured"), naming the story, the theme and the element. The focus ring SHALL be at least 2 px thick around the whole control and SHALL contrast at least 3:1 with the control's unfocused state and with the surface.

#### Scenario: Control with its own focus style
- **WHEN** a core-screen story contains a control that removes the outline on focus and draws nothing else
- **THEN** the UI check fails naming the story, the theme and the control

#### Scenario: Every control shows the ring
- **WHEN** every focusable element of the core-screen stories shows the token focus ring on keyboard focus, fully visible
- **THEN** the focus-visibility pass reports no failure

#### Scenario: Focused row under the phone bar
- **WHEN** the shell story at 375 px focuses a row that sits under the tab bar
- **THEN** the UI check fails naming the story, the theme and the row
