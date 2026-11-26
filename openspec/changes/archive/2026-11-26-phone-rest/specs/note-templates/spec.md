## ADDED Requirements

### Requirement: From template on a phone
Below 768 px, where the Notes page has no New note button and its split part, **From template…** SHALL be the first item of the Notes page's menu, in List mode and in Graph mode. Choosing it SHALL open the same list of templates (the user's first, then the built-in ones), and choosing a template SHALL create and open the note as the split part does: in one batch with one Undo, offline too, syncing and converging like any note. From 768 px the menu SHALL not hold the item, since New note's split part does.

#### Scenario: Start a note from a template on a phone
- **WHEN** the user opens the Notes page's menu at 390 px, taps From template… and then "Weekly review"
- **THEN** a note titled "Weekly review" is created from the template and opens

#### Scenario: Offline
- **WHEN** the phone is offline and the user chooses their template "Meeting" from the menu's From template…
- **THEN** the note is created and opens at once, and syncs when the connection returns

#### Scenario: Desktop
- **WHEN** the Notes page is open at 1280 px
- **THEN** From template… is the split part of New note and the page's menu has no such item
