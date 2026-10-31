## ADDED Requirements

### Requirement: Custom accent meets every accent contrast pair
The derivation of a custom accent (OpenSpec `appearance-preferences` "Custom accent colour") SHALL produce values for which every contrast pair the contrast check holds for an accent-derived token, on either side of the pair, reaches its target in light and in dark mode, measured as the check measures: mixes resolved and translucent tokens composited over their surface. The derivation SHALL use the same mix ratios the stylesheet declares. `make check` SHALL prove this over a fixed sweep of input colours covering the hue circle at several lightness and chroma levels, plus black, white and greys, and SHALL pin the exact derived values of a list of input colours in shared test vectors, failing with the input, the mode, the pair and the measured ratio. The same sweep SHALL check that no derived accent is closer to the danger or priority-1 colour of its mode than the built-in Rose theme is, and that every built-in theme passes that check unchanged.

#### Scenario: A mix ratio change breaks a custom accent
- **WHEN** a contributor changes the soft-step ratio so that some derived custom accent's soft text falls to 4.3:1 on its soft surface in dark mode
- **THEN** the contrast check in `make check` fails naming the input colour, the mode, the pair and the ratio

#### Scenario: Vectors pin the derivation
- **WHEN** a change to the derivation alters the derived light accent of `#ffe066`
- **THEN** the vector test fails showing the expected and the derived value, and the change must update the vectors on purpose

#### Scenario: Built-in themes pass the red guard
- **WHEN** the sweep runs
- **THEN** the eight built-in themes pass the distance check from the danger and priority-1 colours without any hue turn
