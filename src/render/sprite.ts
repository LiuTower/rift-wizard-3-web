/**
 * Procedural hand-drawn sprite DSL.
 *
 * Sprites are vector shape lists in a unit box (0..1, y down). Every vertex is
 * nudged by a deterministic wobble so the result reads as ink-on-black line art
 * rather than crisp vector clip-art, matching the series' hand-drawn look.
 *
 * Colours may be literal (`'#ff5219'`) or palette refs (`'$0'`, `'$1'`, ...)
 * resolved against `SpriteDef.palette`.
 */

export type Shape =
  | { t: 'poly'; pts: number[]; fill?: string; stroke?: string; w?: number; open?: boolean }
  | { t: 'circle'; x: number; y: number; r: number; fill?: string; stroke?: string; w?: number }
  | { t: 'ellipse'; x: number; y: number; rx: number; ry: number; rot?: number; fill?: string; stroke?: string; w?: number }
  | { t: 'line'; pts: number[]; stroke: string; w?: number }
  | { t: 'arc'; x: number; y: number; r: number; a0: number; a1: number; stroke: string; w?: number }
  | { t: 'blob'; x: number; y: number; r: number; lobes?: number; fill?: string; stroke?: string; w?: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; sw?: number }

export interface SpriteDef {
  shapes: Shape[]
  palette?: string[]
  /** 0 = crisp, 1 = very shaky. Default 0.5 */
  wobble?: number
  /** draws across 2x2 tiles */
  big?: boolean
}

const cache = new Map<string, HTMLCanvasElement>()

function hash(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** Deterministic per-sprite jitter stream. */
function jitterer(seed: number, amount: number): () => number {
  let s = seed || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return ((s / 4294967296) - 0.5) * 2 * amount
  }
}

function resolve(color: string | undefined, palette: string[] | undefined): string | undefined {
  if (!color) return undefined
  if (color[0] === '$') {
    const i = Number(color.slice(1))
    return palette?.[i] ?? '#ffffff'
  }
  return color
}

function paint(ctx: CanvasRenderingContext2D, shape: Shape, size: number, palette: string[] | undefined, jit: () => number): void {
  const S = size
  const fill = resolve('fill' in shape ? shape.fill : undefined, palette)
  const strokeColor = resolve('stroke' in shape ? shape.stroke : undefined, palette)
  // `rect.w` is the rectangle's width, not a stroke width — rects carry `sw`.
  const lineW = shape.t === 'rect' ? (shape.sw ?? 0.055) : (('w' in shape ? shape.w : undefined) ?? 0.055)

  ctx.lineWidth = Math.max(1, lineW * S)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  ctx.beginPath()
  switch (shape.t) {
    case 'poly':
    case 'line': {
      const pts = shape.pts
      for (let i = 0; i < pts.length; i += 2) {
        const px = (pts[i] + jit() * 0.02) * S
        const py = (pts[i + 1] + jit() * 0.02) * S
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
      }
      if (shape.t === 'poly' && !shape.open) ctx.closePath()
      break
    }
    case 'circle': {
      const steps = 14
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2
        const r = (shape.r + jit() * 0.03) * S
        const px = shape.x * S + Math.cos(a) * r
        const py = shape.y * S + Math.sin(a) * r
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
      }
      ctx.closePath()
      break
    }
    case 'ellipse': {
      const steps = 16
      const rot = shape.rot ?? 0
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2
        const rx = (shape.rx + jit() * 0.02) * S
        const ry = (shape.ry + jit() * 0.02) * S
        const lx = Math.cos(a) * rx, ly = Math.sin(a) * ry
        const px = shape.x * S + lx * Math.cos(rot) - ly * Math.sin(rot)
        const py = shape.y * S + lx * Math.sin(rot) + ly * Math.cos(rot)
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
      }
      ctx.closePath()
      break
    }
    case 'arc': {
      const steps = 12
      for (let i = 0; i <= steps; i++) {
        const a = shape.a0 + (shape.a1 - shape.a0) * (i / steps)
        const r = (shape.r + jit() * 0.02) * S
        const px = shape.x * S + Math.cos(a) * r
        const py = shape.y * S + Math.sin(a) * r
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
      }
      break
    }
    case 'blob': {
      const lobes = shape.lobes ?? 5
      const steps = 20
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2
        const wob = 1 + Math.sin(a * lobes) * 0.16 + jit() * 0.06
        const r = shape.r * wob * S
        const px = shape.x * S + Math.cos(a) * r
        const py = shape.y * S + Math.sin(a) * r
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
      }
      ctx.closePath()
      break
    }
    case 'rect': {
      const x = (shape.x + jit() * 0.012) * S
      const y = (shape.y + jit() * 0.012) * S
      const w = shape.w * S, h = shape.h * S
      ctx.moveTo(x, y); ctx.lineTo(x + w, y + jit() * 0.01 * S)
      ctx.lineTo(x + w + jit() * 0.01 * S, y + h); ctx.lineTo(x, y + h)
      ctx.closePath()
      break
    }
  }

  if (fill) { ctx.fillStyle = fill; ctx.fill() }
  if (strokeColor) { ctx.strokeStyle = strokeColor; ctx.stroke() }
}

/** Rasterise a sprite at a given pixel size (cached). */
export function rasterize(key: string, def: SpriteDef, size: number): HTMLCanvasElement {
  const cacheKey = `${key}@${size}`
  const hit = cache.get(cacheKey)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  const dpr = Math.min(2, Math.max(1, Math.round(window.devicePixelRatio || 1)))
  canvas.width = Math.ceil(size * dpr)
  canvas.height = Math.ceil(size * dpr)
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.scale(dpr, dpr)
    const jit = jitterer(hash(key), def.wobble ?? 0.5)
    for (const shape of def.shapes) paint(ctx, shape, size, def.palette, jit)
  }
  cache.set(cacheKey, canvas)
  return canvas
}

export interface DrawOpts {
  /** flip horizontally */
  flip?: number
  alpha?: number
  /** colour wash over the sprite, 0..1 strength */
  tint?: string
  tintAmount?: number
}

export function drawSprite(
  ctx: CanvasRenderingContext2D, key: string, def: SpriteDef,
  px: number, py: number, size: number, opts: DrawOpts = {},
): void {
  const img = opts.tint ? tinted(key, def, size, opts.tint, opts.tintAmount ?? 0.6) : rasterize(key, def, size)
  const prevAlpha = ctx.globalAlpha
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha
  if (opts.flip === -1) {
    ctx.save()
    ctx.translate(px + size, py)
    ctx.scale(-1, 1)
    ctx.drawImage(img, 0, 0, size, size)
    ctx.restore()
  } else {
    ctx.drawImage(img, px, py, size, size)
  }
  ctx.globalAlpha = prevAlpha
}

function tinted(key: string, def: SpriteDef, size: number, color: string, amount: number): HTMLCanvasElement {
  const cacheKey = `${key}@${size}~${color}~${amount.toFixed(2)}`
  const hit = cache.get(cacheKey)
  if (hit) return hit
  const base = rasterize(key, def, size)
  const canvas = document.createElement('canvas')
  canvas.width = base.width
  canvas.height = base.height
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.drawImage(base, 0, 0)
    ctx.globalCompositeOperation = 'source-atop'
    ctx.globalAlpha = amount
    ctx.fillStyle = color
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  cache.set(cacheKey, canvas)
  return canvas
}

/**
 * Fallback sprite so a missing art key still renders something distinct
 * instead of a blank tile.
 */
export function fallbackSprite(key: string): SpriteDef {
  const h = hash(key)
  const hue = h % 360
  const c1 = `hsl(${hue} 60% 62%)`
  const c2 = `hsl(${(hue + 40) % 360} 55% 38%)`
  const form = h % 4
  if (form === 0) {
    return { shapes: [{ t: 'blob', x: 0.5, y: 0.55, r: 0.3, fill: c2, stroke: c1 }, { t: 'circle', x: 0.42, y: 0.45, r: 0.05, fill: '#000' }] }
  }
  if (form === 1) {
    return { shapes: [{ t: 'poly', pts: [0.5, 0.16, 0.82, 0.8, 0.18, 0.8], fill: c2, stroke: c1 }] }
  }
  if (form === 2) {
    return { shapes: [{ t: 'rect', x: 0.22, y: 0.24, w: 0.56, h: 0.56, fill: c2, stroke: c1 }] }
  }
  return { shapes: [{ t: 'ellipse', x: 0.5, y: 0.52, rx: 0.3, ry: 0.36, fill: c2, stroke: c1 }] }
}

export function clearSpriteCache(): void { cache.clear() }
