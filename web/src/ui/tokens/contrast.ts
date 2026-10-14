// WCAG 2.x relative luminance and contrast ratio for opaque CSS colours
// (#rgb, #rrggbb, rgb(r g b)).
export function parseColor(value: string): [number, number, number] {
  const v = value.trim().toLowerCase()
  let m = v.match(/^#([0-9a-f]{3})$/)
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16)) as [number, number, number]
  m = v.match(/^#([0-9a-f]{6})$/)
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as [number, number, number]
  m = v.match(/^rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*\)$/)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  throw new Error(`unsupported or translucent colour: ${value}`)
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(parseColor(a)), luminance(parseColor(b))].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}
