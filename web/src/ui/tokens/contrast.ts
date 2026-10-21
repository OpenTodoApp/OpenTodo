// WCAG 2.x contrast ratio for any CSS colour the tokens use: hex, rgb(), oklch(),
// color-mix() (OpenSpec change tokens-v2, design D2). A translucent colour is
// composited over the other one, as it is drawn.
import { composite, parseRgba, ratioOf } from './resolve'

export function contrast(a: string, b: string): number {
  const back = parseRgba(b)
  const under = back.a >= 1 ? back : composite(back, { r: 1, g: 1, b: 1, a: 1 })
  const front = parseRgba(a)
  return ratioOf(front.a >= 1 ? front : composite(front, under), under)
}
