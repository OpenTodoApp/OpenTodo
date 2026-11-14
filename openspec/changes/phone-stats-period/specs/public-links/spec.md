# Spec Delta

## ADDED Requirements

### Requirement: Public page name on a phone
Below 768 px the public page SHALL show the project's name, its heading, on up to two lines and then end it with an ellipsis; from 768 px the name SHALL stay one line. The project's colour dot SHALL stay on the name's first line. The heading's text SHALL be the whole name, so assistive technology reads it in full, and while the name is cut it SHALL show in full on hover and on keyboard focus. The page SHALL NOT scroll sideways because of a long name. This is presentation only: the page keeps no local copy and reads the name from the server as before.

#### Scenario: A long name on a phone
- **WHEN** a guest opens the link of "Home renovation with a rather long project name" on a 360 px wide phone
- **THEN** the heading shows the whole name on two lines, and the public notice follows under it

#### Scenario: A name longer than two lines
- **WHEN** the name does not fit two lines at 360 px
- **THEN** the second line ends with an ellipsis, a screen reader reads the whole name, and focusing the heading with Tab shows the whole name

#### Scenario: Wider screens
- **WHEN** the same link is opened at 1280 px
- **THEN** the name is on one line, as before
