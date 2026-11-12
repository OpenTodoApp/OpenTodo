## ADDED Requirements

### Requirement: Habits in the weekly review
While Habits is on and the user has at least one open habit, the weekly review's Look back step SHALL show a **Habits** section after the week's completions: each open habit with its thread for the review's week, its kept measure for that week and the week's check-in notes, newest first, computed on the device from local rows, offline too. A habit SHALL open its page from the section. While Habits is off or not decided, or with no open habit, the section SHALL not be shown. The section SHALL write nothing.

#### Scenario: A Friday review
- **WHEN** the user reviews the week in which Run was done three times with two notes and Read six of seven days
- **THEN** the Habits section shows both threads for the week, "3 of 3" and "6 of 7", and Run's two notes

#### Scenario: Habits off
- **WHEN** Habits is off
- **THEN** the review shows no Habits section
