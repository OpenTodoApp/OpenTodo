// The local refusals a person can cause (a project or task deleted on another
// device, a reminder without a time…). lib/ops.ts, lib/reminders.ts and
// lib/timeEntries.ts throw these sentences and app/actionError.ts translates the
// same constants, so rewording one here keeps its translation working.

export const LOCAL_ERRORS = {
  projectNotFound: 'project not found',
  parentProjectNotFound: 'parent project not found',
  taskNotFound: 'task not found',
  parentTaskNotFound: 'parent task not found',
  notSignedIn: 'not signed in',
  timeEntryNotFound: 'time entry not found',
  reminderTimeRequired: 'reminder time is required',
  offsetNotWhole: 'offset must be a whole number of minutes',
} as const
