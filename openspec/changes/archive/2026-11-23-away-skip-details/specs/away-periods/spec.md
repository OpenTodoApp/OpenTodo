## ADDED Requirements

### Requirement: Which tasks the period skips
When the period skips anything, the Away dialog SHALL offer Show details beside its line of what it will do. It SHALL list, before Set away, one row per repeating task the period skips: its title, how many of its occurrences are skipped, and the date it will be due once they are, in title order, in a list that scrolls when it is long. The list SHALL follow the chosen days and the Everything or Only choice as they change, and Hide details SHALL close it. It SHALL be computed on the device from the same plan Set away writes, so it works offline and lists exactly what will be skipped.

#### Scenario: Checking before going away
- **WHEN** the user opens Away for 25 November to 1 December with a daily "Water plants" and a weekly "Bins" on Fridays, and chooses Show details
- **THEN** the list shows "Bins" with 1 skipped and due 4 December, and "Water plants" with 7 skipped and due 2 December

#### Scenario: A shorter period
- **WHEN** the details are open and the user moves the last day to 26 November
- **THEN** the list shows only "Water plants", with 2 skipped
