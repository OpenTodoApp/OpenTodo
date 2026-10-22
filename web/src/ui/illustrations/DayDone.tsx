// Done for today (OpenSpec change moments-and-onboarding, design D1; design-system
// "Illustration set"): a closed notebook with a ribbon and a crescent moon above it;
// the moon is the one accent shape.
export function DayDone() {
  return (
    <svg viewBox="0 0 160 120" width="160" height="120" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-illustration="day-done">
      <path d="M22 104h116" />
      <rect x="48" y="58" width="64" height="44" rx="4" fill="var(--color-sunken)" />
      <path d="M56 58v44M88 58V46l5 4 5-4v12" />
      <path d="M88 22a16 16 0 1 0 18 22 13 13 0 0 1-18-22Z" fill="var(--color-accent)" fillOpacity="0.15" />
      <path d="M118 28v4M116 30h4M62 34v3M60.5 35.5h3" />
    </svg>
  )
}
