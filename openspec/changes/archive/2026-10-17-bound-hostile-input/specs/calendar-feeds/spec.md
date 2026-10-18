## ADDED Requirements

### Requirement: Bounded recurrence expansion
A rule without `COUNT` SHALL be expanded from the window's start, producing the same occurrences in the window as a walk from `DTSTART`. One calendar's expansion SHALL share a budget of 500,000 rule periods and occurrence starts and a 5 second deadline; when either runs out, the occurrences found so far SHALL be kept with a status warning. Devices read the stored occurrences; an offline device keeps its cached events until it syncs.

#### Scenario: Old daily series
- **WHEN** a feed holds a daily event starting on 1 January 1970
- **THEN** every day of the window has its occurrence and the fetch finishes quickly

#### Scenario: Calendar that repeats too much
- **WHEN** a feed's rules would expand to more work than the budget allows
- **THEN** the fetch succeeds with the occurrences found so far and the status warns that some events are left out
