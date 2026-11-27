## ADDED Requirements

### Requirement: Finish a standalone note on a phone
Below 768 px, while a standalone note is open, the floating button SHALL show an upward arrow named **Done** instead of the New note plus. Activating it SHALL finish editing and return to Notes without creating another note. The existing automatic save SHALL retain pending title and body edits locally, including offline; those edits SHALL sync and converge through the existing note operations. On Notes without an open standalone note, the floating plus SHALL continue to start a note. Desktop controls and daily notes SHALL keep their existing behavior.

#### Scenario: Finish immediately after typing
- **WHEN** a person types a title and body in a new note on a 390 px phone and immediately taps Done
- **THEN** Notes opens, only that one note exists, and reopening it shows the final title and body

#### Scenario: Finish an existing note offline
- **WHEN** a person edits an existing standalone note offline on a phone and activates Done with the keyboard
- **THEN** Notes opens without another note being created, the edits survive reopening and reload, and they sync through the existing note operations when connectivity returns

#### Scenario: Start the next note
- **WHEN** a person has finished a note and taps the plus on Notes
- **THEN** one new note opens and the floating button becomes the Done arrow again
