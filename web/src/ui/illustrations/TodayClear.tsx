// Today clear (OpenSpec change moments-and-onboarding, design D1; design-system
// "Illustration set"): a mug seen from the side with two steam lines and a small sun,
// drawn like Inbox zero: currentColor strokes, the sunken surface as the only shape
// fill, one accent shape at low opacity.
export function TodayClear() {
  return (
    <svg viewBox="0 0 160 120" width="160" height="120" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-illustration="today-clear">
      <path d="M22 104h116" />
      <path d="M50 62h44v28a14 14 0 0 1-14 14H64a14 14 0 0 1-14-14Z" fill="var(--color-sunken)" />
      <path d="M94 70h5a9 9 0 0 1 0 18h-6" />
      <path d="M64 52c-4-5 4-8 0-14M80 52c-4-5 4-8 0-14" />
      <circle cx="124" cy="34" r="9" fill="var(--color-accent)" fillOpacity="0.15" />
      <path d="M124 18v-4M140 34h4M136 22l3-3M136 46l3 3M112 22l-3-3" />
    </svg>
  )
}
