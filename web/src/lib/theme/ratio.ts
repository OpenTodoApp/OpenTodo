/** A contrast ratio as people read it: one decimal, truncated, so 4.49 never reads as 4.5 (theme-editor D8). */
export function formatRatio(r: number): string {
  return (Math.floor(r * 10) / 10).toFixed(1)
}
