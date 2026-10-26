// Test files that still waited a fixed time when test-hygiene/no-fixed-wait came in
// (eslint/no-fixed-wait.js, test audit F2): the rule is off for these until their
// waits are conditions. Remove a file once it is clean; never add one.
export default [
  'src/app/calendarView.test.tsx',
  'src/app/dashboardDrop.test.tsx',
  'src/app/firstRun.test.tsx',
  // The same file once the scale tests run on their own (test audit F4): its
  // waits are the measurement windows of the render and read budgets.
  'src/app/listPerformance.perf.test.tsx',
  'src/app/monthView.test.tsx',
  'src/app/planView.test.tsx',
  'src/app/shareCaptureFiles.test.tsx',
  'src/app/sidePanel.test.tsx',
  'src/app/templateDialogs.test.tsx',
  'src/app/timeTracking.test.tsx',
  'src/app/timelineView.test.tsx',
  'src/app/todayAgenda.test.tsx',
  'src/app/triageView.test.tsx',
  'src/app/uiCorrectness.test.tsx',
]
