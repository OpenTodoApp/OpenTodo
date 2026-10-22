// Week clear (OpenSpec change moments-and-onboarding, design D1; design-system
// "Illustration set"): seven small soft-cornered squares in a row on a baseline, the first
// slightly raised and the only accent shape; the others take the sunken fill.
const DAYS = [36, 54, 72, 90, 108, 126]

export function WeekClear() {
  return (
    <svg viewBox="0 0 160 120" width="160" height="120" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-illustration="week-clear">
      <path d="M14 96h132" />
      <rect x="18" y="66" width="14" height="14" rx="3" fill="var(--color-accent)" fillOpacity="0.15" />
      <path d="M25 58v-6" />
      {DAYS.map((x) => <rect key={x} x={x} y="78" width="14" height="14" rx="3" fill="var(--color-sunken)" />)}
    </svg>
  )
}
