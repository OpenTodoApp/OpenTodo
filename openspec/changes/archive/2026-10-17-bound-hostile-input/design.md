# Design

## D1. Linear unfolding with early limits

`unfoldLimited` scans the body once, appending continuation lines to one `strings.Builder`, and stops as soon as a limit is exceeded: logical lines (`Limits.Props`, checked while unfolding instead of after), physical lines (`8 × Props`: 40,000 for a CalDAV resource, whose 1 MB folded at 75 octets is about 14,000 lines) and bytes per logical line (`MaxLineBytes` = 64 KB, room for long descriptions and small inline attachments). Errors wrap `ErrInvalid`, so callers answer as for any malformed body. `Unfold` keeps its signature and output and stays unbounded (it is still linear).

## D2. MCP batches by protocol revision

The transport passes the `MCP-Protocol-Version` header to `Server.HandleVersion`. Revisions 2025-06-18 and 2025-11-25 removed JSON-RPC batching, so a top-level array is an invalid request there. A request without the header is 2025-03-26 by the transport rules, as is the stdio bridge, which sends none; there a batch is allowed up to `MaxBatch` = 20. The response budget (4 MB) is checked before each request runs, so the answer is at most the budget plus one reply (itself bounded by the 200-item cap), and a write whose reply would cross the budget is never run-and-dropped.

## D3. Expansion from the window, shared budget, deadline

For a rule without `COUNT` the produced periods before the window do not matter, so `expandRule` starts at `skipPeriods(...)`: the period index (by frequency and interval) one before the one that contains `window.From − event length − 72 h`. Periods are computed from the index alone, so the result in the window is identical to walking from `DTSTART` (a test compares both for each supported rule part). Rules with `COUNT` still walk from `DTSTART`, bounded by the per-rule `maxPeriods`.

An `expansion` value shared by all events counts periods visited and starts produced (500,000, about one second of CPU) and checks the context every 1,024 units; `Fetch` gives it a 5 s deadline. When it stops, the occurrences so far are kept (then sorted and capped as before) with the warning "this calendar repeats too much to show completely".

## Data model, size, memory

No data model change, no dependency. Binary size unchanged in practice. Memory of a hostile feed's expansion drops from gigabytes to the budget's starts (at most 500,000 points before the 5,000 cap).
