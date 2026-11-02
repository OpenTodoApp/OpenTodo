# Design

## Decision

Per place, the label says what the button does:

| Place | Before | After |
| --- | --- | --- |
| Facet editor footer (`FacetEditor`: When, Do on, Assignee, Take turns, Labels and the other parts) | Done | Close |
| When control's own close (`WhenControl`, `onDone`) | Done | Close |
| Task page published dialog (`TaskPageDialog`) | Done | Close |
| Touch selection toggle (`ListChrome`) and selection bar (`BulkActions`) | Select / Done, Done | Select / Close, Close |
| Focus, Flowtime stop (`FocusParts`) | Done | Stop the timer |

"Close" and "Stop the timer" already exist in all six catalogues, so no new strings are needed. The one changed sentence is the shortcut help line for press and hold, translated in all six languages with each language's word for Close.

Kept: Done in routine pickers and step cards, the accent picker, the project note, the dashboard's Arrange toggle, the calendar's filter dialog, the first-day card and the Settings secrets, which confirm a choice or end an edit away from any task, and Done as a status word.

## Data model

None: wording only.

## Interface budget

No new rows, properties, destinations, scroll regions or shortcuts; button widths change by a few characters.

## Size

No dependency; bundle size unchanged within rounding.
