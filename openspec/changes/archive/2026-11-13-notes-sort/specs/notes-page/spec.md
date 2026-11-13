## ADDED Requirements

### Requirement: Sorting the list
The Notes page header SHALL offer, in its overflow menu, a Sort choice of **Last changed** (the default and the order of "Notes page"), **Created** and **Title**, each with a direction: newest first for the two times and A to Z for Title, reversed by choosing the checked order again and shown by an arrow beside it. Title SHALL compare the shown titles in the app language's collation with numbers in numeric order, untitled notes last in either direction; Created SHALL use a standalone note's creation time, a task note's task's creation time and a project note's project's creation time; ties SHALL fall back to the last change. The order SHALL apply to the notes listed under **Recent** when no words are searched, chips included, and its heading SHALL name the order; **Pinned** SHALL keep the user's pin order, and search words SHALL keep the search ranking. The order SHALL be stored on the device only, never synced or written as an operation, and SHALL work offline; with storage refused it SHALL hold for the visit. Graph mode SHALL ignore it.

#### Scenario: By title
- **WHEN** the user has the notes "Week 10", "Wi-Fi", "Week 2" and an untitled note, chooses Sort → Title
- **THEN** the list reads "Week 2", "Week 10", "Wi-Fi", "Untitled note", under the heading "A–Z"

#### Scenario: Reverse
- **WHEN** the order is Title and the user chooses Title again
- **THEN** the list reads "Wi-Fi", "Week 10", "Week 2", "Untitled note", the heading reads "Z–A" and the arrow beside Title points the other way

#### Scenario: Created
- **WHEN** the note "Reading log" was created in January and edited today, and "Ideas" was created yesterday and not edited since, and the user chooses Created
- **THEN** "Ideas" is listed before "Reading log"

#### Scenario: Pinned keeps its order
- **WHEN** the user has pinned "Wi-Fi" then "Packing list" and sorts by Title
- **THEN** Pinned still lists "Wi-Fi" then "Packing list", and the other notes follow under "A–Z"

#### Scenario: Search ranks
- **WHEN** the order is Title and the user types `ferry`
- **THEN** the results are ranked as search ranks them, and clearing the words lists the notes A to Z again

#### Scenario: Chips keep the sort
- **WHEN** the order is Created and the field holds the chip "in: Renovation" with no words
- **THEN** the notes in Renovation are listed newest created first

#### Scenario: Per device
- **WHEN** the user sorts by Title on the laptop and opens Notes on the phone
- **THEN** the phone lists by Last changed, and the laptop still lists by Title after a reload, offline included
