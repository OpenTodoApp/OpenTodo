# app-icon-badge Specification

## Purpose
The number of today's open tasks on the installed app's icon through the Badging API: what it counts, how it follows changes while the app runs and on a push while it is closed, and the per-device switch.

## Requirements

### Requirement: Today's open tasks on the app icon
Where the browser supports app badges, the installed app's icon SHALL show the number of today's open tasks: the same number as the sidebar's Today count, counting every task Today lists (overdue, due or started today, deadline today or earlier) and not only the slots of the Today limit. The number SHALL update on every local change and every applied sync while the app runs, and the badge SHALL be cleared when the number is zero. The count is computed from the device's local data, so it works offline; after a sync it follows the converged data like every other view. A refusal by the system (no notification permission, not installed) SHALL be ignored without an error.

#### Scenario: Completing a task lowers the badge
- **WHEN** Today lists three open tasks and the person completes one
- **THEN** the icon shows 2

#### Scenario: A change from another device
- **WHEN** a sync brings a new task due today from another device
- **THEN** the badge goes up by one without a reload

#### Scenario: Nothing left
- **WHEN** the last open task of today is completed or moved to tomorrow
- **THEN** the badge is removed

#### Scenario: Offline
- **WHEN** the device is offline and the person adds a task for today
- **THEN** the badge goes up at once, and the change syncs later as usual

### Requirement: The badge while the app is closed
While the app runs it SHALL keep, on the device, the count of each of the next seven days that the chosen **Count** gives (Today or Earlier) as its local data stands, holding dates and numbers only. When a push arrives and no window of the app is visible, the service worker SHALL set the badge to the stored count of the current logical day (the day start included), clear it at zero, and leave it alone when no count is stored for that day. Push payloads SHALL NOT carry a count or any new field.

#### Scenario: A morning reminder
- **WHEN** yesterday the app knew of two tasks due today and one overdue, and a reminder push arrives this morning with the app closed
- **THEN** the badge shows 3

#### Scenario: Nothing stored
- **WHEN** a push arrives on a device where the badge is off or nobody is signed in
- **THEN** the badge is not changed

### Requirement: Per-device switch
Settings → Notifications SHALL offer **Count** under **App icon badge** with three choices: **Today** (the default) counts today's open tasks as described above; **Earlier** counts only the tasks in Today's Earlier group (due before today, or with a deadline before today and not planned for today), leaving out tasks assigned to someone else as Today does; **Off** shows no badge. The choice SHALL be kept on this device only and never synced, and shown only where the browser supports app badges; a device that had the badge turned off before this choice existed SHALL read Off, any other Today. While notification permission is not granted and the choice is not Off it SHALL say that iPhone and iPad show the badge only once notifications are allowed. Choosing Off SHALL clear the badge and the stored counts at once; signing out SHALL do the same. Changing the choice SHALL set the badge and the stored counts of the next days at once.

#### Scenario: Turned off
- **WHEN** the person chooses Off
- **THEN** the badge disappears, and later changes and pushes do not set it

#### Scenario: Unsupported browser
- **WHEN** Settings → Notifications is opened in a browser without app badges
- **THEN** the App icon badge card is not shown

#### Scenario: Sign-out
- **WHEN** the person signs out
- **THEN** the badge is cleared and no count stays on the device

#### Scenario: Earlier only
- **WHEN** Today lists one overdue task, one due today and one whose deadline is today, and the person chooses Earlier
- **THEN** the icon shows 1, and with the app closed a push the next morning sets it to 3, the two of yesterday now being overdue too
