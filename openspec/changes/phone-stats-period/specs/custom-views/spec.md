# Spec Delta

## ADDED Requirements

### Requirement: A cut view name stays readable
A view's name in its header ("Views › <name>", in the shell's bar below 768 px) SHALL stay on one line. While the name is cut it SHALL show in full on hover and on keyboard focus, and it SHALL be in the Tab order only while it is cut; its text SHALL be the whole name for assistive technology. This is presentation only and reads no data beyond the view's name.

#### Scenario: A long name on a phone
- **WHEN** the view "Deep work and everything else that matters" is open at 360 px
- **THEN** the bar shows "Views ›" and the name on one line, cut with an ellipsis, and focusing the name with Tab shows the whole name

#### Scenario: A short name
- **WHEN** the view "Waiting for" is open
- **THEN** the name is not a Tab stop and has no tooltip
