/**
 * Vendored subset of platform web/js/sh.mts for @tangentstorm/gestalt.
 * Only the helpers used by the player (sketch + anim stack).
 */

export const num = parseFloat

export const und = (x: any): x is undefined | null =>
  x === undefined || x === null

export const doc = document

/** Binary search: largest index i with xs[i] <= x (or -1 if x < xs[0]). */
export function bin(xs: number[], x: number): number {
  let a = 0, z = xs.length - 1, m, i
  if (!xs.length || x < xs[a]) return -1
  if (x >= xs[z]) return z
  while (a <= z) {
    i = a + (m = (z - a) >>> 1)
    if (!m || x === xs[i]) return i
    if (x < xs[i]) z = i
    else a = i
  }
  console.warn('bin: failed to find index')
  return a
}

export const raf = (cb: FrameRequestCallback): number =>
  window.requestAnimationFrame(cb)

export function qs<T extends Element = HTMLElement>(
  x: string | ParentNode,
  y?: string,
): T | null {
  const [base, sel] = und(y) ? [doc, x as string] : [x as ParentNode, y as string]
  return base.querySelector<T>(sel)
}

export function qsa<T extends Element = HTMLElement>(
  x: string | ParentNode,
  y?: string,
): T[] {
  const [base, sel] = und(y) ? [doc, x as string] : [x as ParentNode, y as string]
  return Array.from(base.querySelectorAll<T>(sel))
}
