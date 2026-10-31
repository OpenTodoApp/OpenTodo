// The curated swatches of the custom accent picker (OpenSpec change accent-colour,
// design D5): nine hues around the circle, skipping the error red, at two lightness
// levels (OKLCH L 0.52 and 0.45, chroma 0.16). Each passes the derivation unchanged,
// so a swatch is applied exactly as shown (accentDerive.test.ts checks it). Colours a
// person picks, stored as data, so they live in a .ts file, outside the token lint.
export const ACCENT_SWATCHES: readonly string[] = [
  '#a83876', '#ad4400', '#866400', '#297d0f', '#007a6c', '#0073b0', '#3263c3', '#6356bf', '#8a46a7',
  '#912061', '#962d00', '#725000', '#0c6800', '#006e61', '#00609b', '#1e4eac', '#5040a8', '#753091',
]
