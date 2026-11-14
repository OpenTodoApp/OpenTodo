## MODIFIED Requirements

### Requirement: No floating add button in the rituals
Below 768 px the shell SHALL NOT show the floating add button on a screen that ends in its own action, so the button never covers that action: Focus and Close the day, which keep nothing else on screen, and every step of the Weekly review, which ends in Back and Next. The tab bar SHALL stay. The Daily check and the Monthly look, whose action is in the page header, SHALL keep the button, and the button SHALL return on the next view that offers quick add. Close the day SHALL draw one divider under the shell's bar on a phone, also while it offers Reopen the day.

#### Scenario: Focus on a phone
- **WHEN** the user opens Focus on a 390 px phone
- **THEN** the tab bar stays, the floating add button is gone, and it returns when the user opens Today

#### Scenario: Close the day after closing
- **WHEN** the user reopens Close the day on a 390 px phone after closing the day
- **THEN** Reopen the day shows in the page under the shell's bar, with one divider under the bar and no floating add button

#### Scenario: Weekly review on a phone
- **WHEN** the user opens the Weekly review on a 360 px phone
- **THEN** the tab bar stays, there is no floating add button, and nothing covers the step's Next button

#### Scenario: Leaving the review
- **WHEN** the user opens the Daily check from the review's menu, or the Inbox from the tab bar
- **THEN** the floating add button is back
