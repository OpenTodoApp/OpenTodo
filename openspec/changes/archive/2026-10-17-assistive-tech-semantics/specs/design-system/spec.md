## ADDED Requirements

### Requirement: Names are announced

Text that stands for a longer phrase (a count read as "3 comments", an icon read as "Has notes", a deadline read with its date, a warning read in place of a title) SHALL reach assistive technology as visually hidden text inside the element, with the abbreviated visible text hidden from it, and SHALL NOT be an `aria-label` or `aria-labelledby` on an element without a role. An element whose name describes a container SHALL have the role the name belongs to. The web lint SHALL refuse `aria-label` and `aria-labelledby` on a `span` or `div` without a role. The hidden text SHALL NOT change layout or widen a scroller. This is presentation only: no data is stored, and it behaves the same offline.

#### Scenario: A count chip

- **WHEN** a row shows a comment chip with "3"
- **THEN** a screen reader reads "3 comments" and the chip carries no `aria-label`

#### Scenario: An icon-only chip

- **WHEN** a task has notes
- **THEN** its row's notes chip is read as "Has notes"

#### Scenario: A name on a span

- **WHEN** a component puts `aria-label` on a `span` without a role
- **THEN** `npm run lint` fails and names the file and line
