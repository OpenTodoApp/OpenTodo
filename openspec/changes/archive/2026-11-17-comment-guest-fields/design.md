## Decisions

### D1: The publisher's device, on create only

The fields are checked in `resolveComment` before the author rules. A server writer (a reserved device) passes. A device creating a comment passes when `page_id` is null, or names a row of `task_pages` with the comment's `task_id` and the writer as `user_id`. Revoked pages count, so an import that races a revoke still lands. `guest_name` passes when it is null, or when the same batch names such a page. On a stored comment, a device may only send the stored value again, which keeps a re-seed or a retried batch harmless.

Refusing the fields from every device would break the import of encrypted replies, which the task-pages spec requires of the publisher's device.

### D2: One stored-value lookup

The resolver already had `storedField` (used by the daily-note check). The attachment upload-state rule now uses it too, instead of its own copy.
