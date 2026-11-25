## ADDED Requirements

### Requirement: Touch title editing
On a touch screen of any width, without a fine pointer, a writable task or subtask row in a list SHALL turn its title into the compact editor when a left swipe is released at 48 px or more and below 96 px. A release at 96 px or more SHALL open Schedule, and a tap on the title SHALL still open the task. The compact editor SHALL show the title field with **Save** and **Cancel**, and the keyboard's return key SHALL read Done.

Each way of ending the edit SHALL do one thing:
- Return, Save, or a tap or click that starts outside the editor and outside the pickers it opened SHALL save the title.
- A finger or pen tap on another task row of the list SHALL do nothing else: it SHALL not open, tick or expand that row.
- A tap elsewhere (the tab bar, the add button, a toast, the header, the side panel) and a mouse or trackpad click SHALL save and then act as usual.
- A press outside that moves (a scroll or a swipe), a long press, a second finger, and a press released in a menu or sheet SHALL leave the editor open.
- **Cancel** SHALL discard the change.

While the on-screen keyboard is open, the editor with its **Save** and **Cancel** SHALL stay in view above it. The edit is the task's title operation, so it SHALL apply locally at once, work offline and converge per field like any title edit. Viewers SHALL get no swipe and no editor.

#### Scenario: On an iPad
- **WHEN** the user swipes "Order the tiles" 70 px to the left on a 1024 px touch screen and lifts the finger
- **THEN** the title becomes the compact editor in the row with the keyboard's return key reading Done, and the task does not open

#### Scenario: A tap outside saves
- **WHEN** the user is editing a title on a phone, changes it and taps another task's title
- **THEN** the new title is saved, the editor closes and the other task does not open

#### Scenario: A tap on the tab bar
- **WHEN** the user is editing a title on a phone, changes it and taps Today in the tab bar
- **THEN** the new title is saved and Today opens

#### Scenario: A trackpad click
- **WHEN** the user is editing a title on an iPad with a trackpad and clicks another task
- **THEN** the new title is saved and the click acts on the other task as it would without the editor

#### Scenario: A scroll keeps the edit
- **WHEN** the user is editing a title on a phone and scrolls the list
- **THEN** the editor stays open with the draft

#### Scenario: Return saves
- **WHEN** the user changes the title in the compact editor and presses Done on the keyboard
- **THEN** the title is saved and the editor closes

#### Scenario: Cancel
- **WHEN** the user changes the title in the compact editor and taps Cancel
- **THEN** the title is unchanged and the editor closes

#### Scenario: A subtask
- **WHEN** the user swipes a subtask a short way left on a phone, changes its title and taps outside
- **THEN** the subtask's title is saved and its parent is unchanged

#### Scenario: Above the keyboard
- **WHEN** the keyboard opens for the compact editor near the bottom of the list
- **THEN** the list scrolls so the field and its Save and Cancel sit above the keyboard
