## MODIFIED Requirements

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
