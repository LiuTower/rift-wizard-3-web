import type { Point } from './types'

export const DIRS8: readonly [number, number][] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
]
export const DIRS4: readonly [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]]

export function dist(x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0, dy = y1 - y0
  return Math.sqrt(dx * dx + dy * dy)
}

/** Chebyshev distance = number of 8-way steps between two tiles. */
export function cheb(x0: number, y0: number, x1: number, y1: number): number {
  return Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
}

export function adjacent(x0: number, y0: number, x1: number, y1: number): boolean {
  return cheb(x0, y0, x1, y1) === 1
}

/** All points with euclidean distance <= r (a "ball", as the series calls it). */
export function ballPoints(cx: number, cy: number, r: number): Point[] {
  const out: Point[] = []
  const ri = Math.ceil(r)
  const rr = r * r + 0.0001
  for (let dy = -ri; dy <= ri; dy++) {
    for (let dx = -ri; dx <= ri; dx++) {
      if (dx * dx + dy * dy <= rr) out.push({ x: cx + dx, y: cy + dy })
    }
  }
  return out
}

/** Ring of points at euclidean distance in (r-1, r]. */
export function ringPoints(cx: number, cy: number, r: number): Point[] {
  const out: Point[] = []
  const ri = Math.ceil(r)
  const outer = r * r + 0.0001
  const inner = (r - 1) * (r - 1) + 0.0001
  for (let dy = -ri; dy <= ri; dy++) {
    for (let dx = -ri; dx <= ri; dx++) {
      const d = dx * dx + dy * dy
      if (d <= outer && d > inner) out.push({ x: cx + dx, y: cy + dy })
    }
  }
  return out
}

/** Bresenham line from (x0,y0) to (x1,y1), inclusive of both ends. */
export function line(x0: number, y0: number, x1: number, y1: number): Point[] {
  const pts: Point[] = []
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let x = x0, y = y0
  for (;;) {
    pts.push({ x, y })
    if (x === x1 && y === y1) break
    const e2 = err * 2
    if (e2 > -dy) { err -= dy; x += sx }
    if (e2 < dx) { err += dx; y += sy }
  }
  return pts
}

/** Points of a cone of half-angle `spread` radians, length `len`, aimed at (tx,ty). */
export function conePoints(cx: number, cy: number, tx: number, ty: number, len: number, spread: number): Point[] {
  const base = Math.atan2(ty - cy, tx - cx)
  const out: Point[] = []
  const seen = new Set<number>()
  const ri = Math.ceil(len)
  for (let dy = -ri; dy <= ri; dy++) {
    for (let dx = -ri; dx <= ri; dx++) {
      if (dx === 0 && dy === 0) continue
      if (dx * dx + dy * dy > len * len + 0.001) continue
      let a = Math.atan2(dy, dx) - base
      while (a > Math.PI) a -= Math.PI * 2
      while (a < -Math.PI) a += Math.PI * 2
      if (Math.abs(a) <= spread) {
        const key = (cx + dx) * 1000 + (cy + dy)
        if (!seen.has(key)) { seen.add(key); out.push({ x: cx + dx, y: cy + dy }) }
      }
    }
  }
  return out
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t }

/** Direction step (unit vector, 8-way) from a to b. */
export function stepToward(x0: number, y0: number, x1: number, y1: number): [number, number] {
  return [Math.sign(x1 - x0), Math.sign(y1 - y0)]
}
