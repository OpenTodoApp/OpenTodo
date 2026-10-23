## ADDED Requirements

### Requirement: Key sequences in tooltips
A tooltip that shows a shortcut SHALL show a key sequence as its steps joined by a translated "then" ("G then T"), each step as its own key badge in upper case, and a chord or single key as one badge. Every sidebar destination that has a `g` sequence SHALL name it in its tooltip ("Go to Today · G then T") with a fine pointer, read from the shortcut registry, so the tooltip and the registry can never disagree; the sequence is not printed in the row itself unless the user turned on shortcut hints.

#### Scenario: Hovering Upcoming
- **WHEN** the user rests the pointer on Upcoming in the sidebar on a desktop
- **THEN** a tooltip reads "Go to Upcoming · G then U", with G and U as key badges

#### Scenario: Registry change
- **WHEN** a contributor changes the shortcut of Go to Upcoming in the registry to `g w`
- **THEN** the tooltip reads "Go to Upcoming · G then W" without any other change

#### Scenario: A chord stays one key
- **WHEN** a tooltip shows the shortcut Ctrl+K
- **THEN** it shows one badge reading "Ctrl+K", without "then"
