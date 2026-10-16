# Spec Delta

## Purpose

Defines what a person sees the first time they sign in on a server: a short in-app start that produces a first task, a chosen appearance and an understanding of where things are, without a tour overlay.

## ADDED Requirements

### Requirement: Three-step first run
The first time an account opens the app, the Inbox SHALL show a three-step card instead of the empty state: add your first task (quick add focused, with one example), choose light, dark or system, and install the app or skip. Each step SHALL be skippable, the card SHALL leave after the third step or Skip all, and it SHALL never return on that account. The card's state SHALL be stored with the account's preferences so a second device does not show it again after sync.

#### Scenario: Complete the first run
- **WHEN** a new owner adds a task, picks dark and skips installing
- **THEN** the card closes, the task is in the Inbox, the app is dark, and reopening the app on another device after sync shows no card

#### Scenario: Skip all
- **WHEN** the user activates Skip all on the first step
- **THEN** the card closes for good and the normal empty state is shown

### Requirement: Sample project
The first run SHALL offer a "Show me around" action that creates one sample project with six tasks demonstrating a date, a deadline, labels, a subtask, a repeat and a note, created as ordinary operations so it syncs and can be deleted like any project. The offer SHALL appear once.

#### Scenario: Create and delete the sample
- **WHEN** the user activates Show me around and later deletes the sample project
- **THEN** the project and its tasks go to the Trash like any other project, and no sample is offered again

### Requirement: Empty states name the action first
Every empty state SHALL show an icon, one sentence naming the action and one button that performs it; a keyboard hint SHALL follow in a second line only on fine-pointer devices.

#### Scenario: Empty Today on a phone
- **WHEN** Today has no tasks on a touch device
- **THEN** it reads "Nothing due today" with an "Add a task" button and no key hint

#### Scenario: Empty Today on a desktop
- **WHEN** Today has no tasks on a desktop
- **THEN** the same text and button are shown with "Press q to add a task" beneath
