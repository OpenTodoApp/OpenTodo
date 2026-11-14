# Spec Delta

## ADDED Requirements

### Requirement: Pull down to sync on a touch device
On a touch device, a finger that pulls the page down from the top of the page's scroller SHALL ask for a sync now, once per pull, when it is released past the pull distance; a shorter pull SHALL do nothing. A mark SHALL follow the pull, SHALL stay while the sync runs and be announced to assistive technology as syncing, and SHALL go when the sync settles. The app SHALL never reload for a pull, and the open page, its scroll position and unsaved input SHALL stay as they were.

The pull SHALL start only with one finger, on a page scrolled to its top, with a move that is clearly vertical. It SHALL NOT start from a mouse, a trackpad or a wheel, in the strip at the left edge that belongs to the edge swipe, inside a scroller within the page that has something to scroll (the calendar grid, a board column), on a focused text field, while text is selected, on a handle that takes its own drag, while a drag is lifted, or while a dialog or sheet is open. A move that turns sideways SHALL be left to the row swipes. While another pulled sync runs, a pull SHALL ask for nothing more.

With reduced motion, the mark SHALL appear in place instead of following the finger and SHALL NOT turn.

The pull changes nothing stored. Offline, signed out or with the device locked, it SHALL say so in a toast with the sync status's own words ("Offline", "Signed out", "Locked"), a sync error SHALL be shown with its sentence, and pending changes SHALL stay queued as before. What the sync brings converges as any sync does; the pull adds no write path.

#### Scenario: Pull on Today
- **WHEN** a person on a phone pulls Today down from its top past the pull distance and lets go
- **THEN** one sync runs, the mark shows while it runs and goes when it ends, and Today is still open at its top

#### Scenario: A short pull
- **WHEN** a person pulls the list down a little and lets go
- **THEN** the mark returns and no sync is asked for

#### Scenario: Offline
- **WHEN** a person on a phone without a connection pulls the Inbox down and lets go
- **THEN** a toast says "Offline", nothing reloads, and their unsynced changes stay pending

#### Scenario: A scrolled list
- **WHEN** a person has scrolled a list down and drags a finger down
- **THEN** the list scrolls back and no sync is asked for

#### Scenario: A row swipe
- **WHEN** a person swipes a task row sideways on a list at its top
- **THEN** the row's own swipe runs and no mark appears

#### Scenario: Inside the calendar
- **WHEN** a person drags a finger down inside the Week grid
- **THEN** the grid scrolls or keeps its own gesture and no sync is asked for

#### Scenario: A mouse
- **WHEN** a person on a computer drags the list down with a mouse or scrolls up at the top with a trackpad
- **THEN** nothing happens, and the gesture's code is not loaded

#### Scenario: Reduced motion
- **WHEN** a person who asked for reduced motion pulls a list down
- **THEN** the mark appears in one place without following the finger, and the sync runs on release as usual
