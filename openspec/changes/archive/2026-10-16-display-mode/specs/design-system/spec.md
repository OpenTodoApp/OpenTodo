# Spec Delta

## ADDED Requirements

### Requirement: High-contrast and no-motion presentation
The tokens SHALL offer a high-contrast override (`data-contrast="high"` on the document root) in which surfaces are pure white or pure black, text reaches at least 7:1 on every surface it is allowed on, soft tints are replaced by outlines, and non-text UI reaches at least 3:1; and a no-motion attribute (`data-motion="none"`) that sets every transition and animation duration to zero. Both SHALL combine with any theme mode and accent and SHALL be covered by the contrast check.

#### Scenario: Override in both modes
- **WHEN** the root carries `data-contrast="high"` in light mode and then in dark mode
- **THEN** the canvas is pure white with black text, then pure black with white text, and every allowed text and surface pair measures at least 7:1

#### Scenario: Override pair fails the check
- **WHEN** a contributor changes a high-contrast text token so a pair falls to 6:1
- **THEN** the contrast check in `make check` fails and names the pair, the override and the measured ratio

#### Scenario: No motion
- **WHEN** the root carries `data-motion="none"` and a task is completed
- **THEN** the row changes state with no transition or animation, as under the system's reduced-motion setting
