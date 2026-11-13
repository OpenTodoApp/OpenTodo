## Why

People share public links for things a board shows better than a list: a party plan with To buy, To cook and To bring, a moving checklist by room (GitHub issue 1281). And the address is a long secret, so a group chat with three links cannot tell them apart (issue 1292).

## What Changes

- A public link gets **Show as: List / Board** when it is created. A board shows a column per section, tasks without a section first, with the same rows and tick boxes as the list.
- The address carries the link's name before the secret, `/public/party-groceries-otl_…`. The secret stays: a name alone is easy to guess. Reads and ticks accept the address with or without the name.

## Capabilities

### Modified Capabilities

- `public-links`: a layout per link and a readable address.

## Impact

- One side table `public_link_layouts` (migration 0071; only board links have a row). No new dependency; the page reuses its rows, so the bundle grows by a few hundred bytes.
- Older clients show a board link as a list. Links made earlier keep their address.
- Sub-projects as columns ("sub-boards" in issue 1281) are out of scope: a public link shows one project's own tasks.
