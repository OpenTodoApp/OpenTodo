## 1. iPhone app

- [x] 1.1 `WidgetPublication.Completed`: `parse` (Android's rule), `barLevel`, `weekdayLetter`; `publish` reloads both widgets
- [x] 1.2 `CompletedWidget` (small family) in the widget bundle: today's count, seven bars in the accent over a track, the weekday letters, the spoken summary, the update time, the locked and the empty states; a tap opens `opentodo://stats`
- [x] 1.3 `AppModel` opens `opentodo://stats` at `/stats`
- [x] 1.4 Strings in `Shared/Localizable.xcstrings` (de, es, fr, it, nl, pl, pt, tr, zh)

## 2. Tests

- [x] 2.1 `WidgetPublicationTests`: the shared fixtures `widget-completed`, `widget-completed-locked` and `widget` (no completions); Android's `CompletedModelTest` cases; the last seven days; the bars; the weekday letters; the Statistics link

## 3. Check

- [x] 3.1 `openspec validate ios-completed-widget --strict`
