## 1. Limits

- [x] 1.1 The calendar's own properties count toward one total for the whole stream (`caldav.Stream`), `too_large` past it; failing tests first (`TestStreamRefuses`, `TestFetchRefusesTooManyCalendarProperties` with a memory bound)
- [x] 1.2 `Worker.Refresh` takes one of `InFlight` slots shared with the background pass; a request that ends while waiting records nothing (`TestRefreshSharesTheInFlightBound`, `TestRefreshWaitingGivesUpWithTheRequest`)

## 2. Records

- [x] 2.1 Spec delta, changelog fragment
