## Decisions

### D1: Refuse the op, opt-in by feature

The server splits the batch before apply: `Validate` and the reserved-device check run per op, and each op that fails becomes `{id, reason: "invalid"}`. The valid ops go through `Apply` unchanged, and the invalid refusals come first in `rejected`. The split happens only for a device that sends `invalid_ops`. An older client would treat an unknown reason as a refusal on the merits, forget its clock, and could remove a row that existed only on the device. So for it the 400 stays, which keeps its change, even though it blocks. A batch over `MaxOpsPerRequest` is still refused whole: that is a client bug, not one op.

No server value is sent back for an `invalid` refusal. The device is told to keep its own.

### D2: Keep it, like a limit

The client treats `invalid` as a held reason (`isHeldReason`), next to the `limit_*` reasons. The op moves to the held list in the same transaction that clears the batch from the outbox, as for limits (client-data-safety). The row keeps its value and the change counts as pending. Held ops go out again every `HELD_RETRY_MS` (one minute), which costs one refused op per minute. That retry is also how a newer client's field reaches an older server once the server is upgraded.

An invalid op does not pass by waiting, so the status is the error state, not "Server limit", with its own sentence. An `invalid` refusal outweighs a limit when both are held.
