// Inbox zero (OpenSpec change inbox-means-unplaced, design D9; design-system
// "Illustrations"): an empty tray drawn in line, with one leaf resting beside it.
// Tokens only: strokes in currentColor (the muted text colour from the wrapper),
// the sunken surface as the only shape fill, one accent fill at low opacity.
export function InboxZero() {
  return (
    <svg viewBox="0 0 160 120" width="160" height="120" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-illustration="inbox-zero">
      <path d="M22 104h116" />
      <path d="M34 74 47 52h66l13 22v20a6 6 0 0 1-6 6H40a6 6 0 0 1-6-6Z" fill="var(--color-sunken)" />
      <path d="M34 74h22a24 14 0 0 0 48 0h22" />
      <path d="M56 40v-8M80 36V24M104 40v-8" />
      <path d="M134 103c0-12 9-19 18-20 0 12-8 19-18 20Z" fill="var(--color-accent)" fillOpacity="0.15" />
      <path d="M134 103l12-14" />
    </svg>
  )
}
