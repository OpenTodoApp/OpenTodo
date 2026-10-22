# Spec Delta

## ADDED Requirements

### Requirement: Done for today
After "Close the day" has written the close, the Close the day screen SHALL show one final state in place of its step card: the `day-done` illustration, "Day closed, <time>", one line with the figures of "How the day went" and the carry-over ("5 done, 3 moved to tomorrow, 1 kept"), the line for tomorrow quoted when one was written, a primary "Back to Today" with focus, and "Reopen the day" where that is offered. It SHALL show no streak, score, comparison or prompt to do more. The state is device interface state: showing it writes nothing, Escape and "Back to Today" return to Today, and reloading the route shows the ordinary first step. Under reduced motion the state SHALL appear with a crossfade only. It SHALL work offline from local rows.

#### Scenario: Close with carry-over
- **WHEN** 5 tasks were completed, the user moved 3 to tomorrow, kept 1 in Today, wrote "Start with the invoice" and activates Close the day at 18:42
- **THEN** the screen shows the notebook-and-moon drawing, "Day closed, 18:42", "5 done, 3 moved to tomorrow, 1 kept", the quoted line, focus on "Back to Today", and Enter opens Today with "Day closed, 18:42" at its end

#### Scenario: Nothing was planned
- **WHEN** Today listed nothing and the user closes the day without a note
- **THEN** the state reads "Day closed" with the time and "Nothing was planned today", no figures line beyond that, and no quoted line

#### Scenario: Reload
- **WHEN** the user reloads the page while the final state is shown
- **THEN** the Close the day screen shows its first step with "Day closed, 18:42" in its header, as for any closed day
