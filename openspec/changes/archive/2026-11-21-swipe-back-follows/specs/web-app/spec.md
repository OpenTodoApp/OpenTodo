## ADDED Requirements

### Requirement: The back swipe follows the finger
On a touch device, a swipe from the start edge on a page with Back SHALL move the page with the finger and SHALL go back when released past a third of the width or with a flick, continuing from where the finger left it; otherwise the page SHALL return to its place. On a page without Back the swipe SHALL pull the menu open with the finger. With reduced motion the swipe SHALL act on release without following. It changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: A short slow swipe
- **WHEN** a person drags a task page a fifth of the way across and lets go slowly
- **THEN** the page returns and the route stays

#### Scenario: A flick on a tablet
- **WHEN** a person flicks a task page from the edge on a 1024 px wide tablet
- **THEN** it goes back even though the finger moved less than a third of the width
