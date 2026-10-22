// Trash empty (OpenSpec change moments-and-onboarding, design D1; design-system
// "Illustration set"): a bin with its lid resting on top and one leaf beside it; the
// leaf is the one accent shape.
export function TrashEmpty() {
  return (
    <svg viewBox="0 0 160 120" width="160" height="120" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-illustration="trash-empty">
      <path d="M22 104h116" />
      <path d="M56 50h48l-5 48a6 6 0 0 1-6 6H67a6 6 0 0 1-6-6Z" fill="var(--color-sunken)" />
      <path d="M50 50h60M72 44h16M80 44v-4" />
      <path d="M72 62v30M88 62v30" />
      <path d="M118 103c0-12 9-19 18-20 0 12-8 19-18 20Z" fill="var(--color-accent)" fillOpacity="0.15" />
      <path d="M118 103l12-14" />
    </svg>
  )
}
