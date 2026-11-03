# Design

## Context

- actionError already turns server refusals into translated sentences by error code; local refusals are plain Error messages thrown by the client library.
- The shared EmptyState is already used by Labels and other collection views.
- SyncStatus shows a dot, a label and a tooltip; in compact mode the label is suppressed unless something needs attention, and the error detail lives in the tooltip.

## Decisions

**D1. A small sentence catalogue for local refusals.** actionError keeps a map from the eight source sentences a user can cause to message ids, then translates with the active catalog. An unknown sentence is returned unchanged, so a newer client on an older catalog still says something. Rejected: changing every library throw to a code, which would touch many call sites for no extra user value.

**D2. Reuse the shared EmptyState.** The Projects empty view uses the same component as Labels, with a title, one distinguishing line and a primary action. The action opens the existing creation prompt through setCreating, so the creation path stays single.

**D3. Keep the error beside the pill.** When sync is in error, the pill keeps its label even in compact mode, and the error text is a role=alert below the pill in both layouts. Healthy idle sync keeps the dot-only compact pill. A tooltip remains for the detail in the non-error states. The alert text is visible, so it carries no native title attribute.

## Risks

- The alert adds a second line under a narrow icon rail; it is truncated and wraps the status area in a column, so the rail stays usable.
- The sentence catalogue can drift from the library's messages. The i18n check fails when a catalog is incomplete, and an unknown sentence still passes through.
