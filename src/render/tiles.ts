import type { BiomeDef } from '../core/realm'
import { Tile } from '../core/types'

/**
 * Procedural tile textures. Each biome/tile/variant combination is rasterised
 * once into a small canvas and reused, which keeps the board draw to plain
 * drawImage calls.
 */

const cache = new Map<string, HTMLCanvasElement>()

function prng(seed: number): () => number {
  let s = seed || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

function floorPattern(ctx: CanvasRenderingContext2D, biome: BiomeDef, size: number, rand: () => number): void {
  ctx.strokeStyle = biome.floorInk
  ctx.fillStyle = biome.floorInk
  ctx.lineWidth = 1
  const S = size
  switch (biome.floorPattern) {
    case 'hatch': {
      const n = 2 + Math.floor(rand() * 3)
      for (let i = 0; i < n; i++) {
        const y = rand() * S
        ctx.beginPath()
        ctx.moveTo(rand() * S * 0.3, y)
        ctx.lineTo(y + rand() * S * 0.4, S * (0.2 + rand() * 0.7))
        ctx.stroke()
      }
      break
    }
    case 'wave': {
      const rows = 2
      for (let r = 0; r < rows; r++) {
        const y = S * (0.3 + r * 0.4) + rand() * 4
        ctx.beginPath()
        for (let x = 0; x <= S; x += 3) {
          const yy = y + Math.sin((x / S) * Math.PI * 3 + r) * 2.2
          if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy)
        }
        ctx.stroke()
      }
      break
    }
    case 'dot': {
      const n = 3 + Math.floor(rand() * 4)
      for (let i = 0; i < n; i++) {
        ctx.beginPath()
        ctx.arc(rand() * S, rand() * S, 1 + rand(), 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'heart': {
      const cx = S * (0.25 + rand() * 0.5)
      const cy = S * (0.3 + rand() * 0.4)
      const r = S * 0.16
      ctx.beginPath()
      ctx.moveTo(cx, cy + r)
      ctx.bezierCurveTo(cx - r * 1.5, cy - r * 0.4, cx - r * 0.3, cy - r * 1.2, cx, cy - r * 0.35)
      ctx.bezierCurveTo(cx + r * 0.3, cy - r * 1.2, cx + r * 1.5, cy - r * 0.4, cx, cy + r)
      ctx.fill()
      break
    }
    case 'crack': {
      let x = rand() * S, y = 0
      ctx.beginPath()
      ctx.moveTo(x, y)
      while (y < S) {
        x += (rand() - 0.5) * S * 0.4
        y += S * (0.2 + rand() * 0.2)
        ctx.lineTo(x, y)
      }
      ctx.stroke()
      break
    }
    case 'star': {
      const n = 2 + Math.floor(rand() * 3)
      for (let i = 0; i < n; i++) {
        const x = rand() * S, y = rand() * S, r = 1.5 + rand() * 2
        ctx.beginPath()
        ctx.moveTo(x - r, y); ctx.lineTo(x + r, y)
        ctx.moveTo(x, y - r); ctx.lineTo(x, y + r)
        ctx.stroke()
      }
      break
    }
    case 'grass': {
      const n = 3 + Math.floor(rand() * 3)
      for (let i = 0; i < n; i++) {
        const x = rand() * S, y = S * (0.5 + rand() * 0.5)
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.quadraticCurveTo(x + (rand() - 0.5) * 6, y - 5, x + (rand() - 0.5) * 8, y - 9)
        ctx.stroke()
      }
      break
    }
  }
}

function wallPattern(ctx: CanvasRenderingContext2D, biome: BiomeDef, size: number, rand: () => number): void {
  const S = size
  ctx.strokeStyle = biome.wallInk
  ctx.fillStyle = biome.wallInk
  ctx.lineWidth = 1.2
  switch (biome.wallPattern) {
    case 'stone': {
      for (let i = 0; i < 3; i++) {
        const x = S * (0.15 + rand() * 0.5), y = S * (0.15 + rand() * 0.5)
        const w = S * (0.2 + rand() * 0.25), h = S * (0.15 + rand() * 0.25)
        ctx.beginPath()
        ctx.moveTo(x, y); ctx.lineTo(x + w, y + rand() * 2)
        ctx.lineTo(x + w - rand() * 3, y + h); ctx.lineTo(x - rand() * 2, y + h)
        ctx.closePath()
        ctx.stroke()
      }
      break
    }
    case 'bone': {
      // stacked bone segments, not a face: two long shafts with knuckle caps
      for (let i = 0; i < 2; i++) {
        const y = S * (0.3 + i * 0.34) + rand() * 2
        const x0 = S * (0.14 + rand() * 0.1), x1 = S * (0.86 - rand() * 0.1)
        ctx.beginPath()
        ctx.moveTo(x0, y); ctx.lineTo(x1, y + (rand() - 0.5) * 2)
        ctx.stroke()
        for (const [cx, sign] of [[x0, -1], [x1, 1]] as [number, number][]) {
          ctx.beginPath()
          ctx.arc(cx + sign * 1.2, y - 1.8, S * 0.05, 0, Math.PI * 2)
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(cx + sign * 1.2, y + 1.8, S * 0.05, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
      break
    }
    case 'brick': {
      for (let row = 0; row < 3; row++) {
        const y = (row + 1) * S / 4
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke()
        const offset = row % 2 ? S * 0.5 : 0
        ctx.beginPath(); ctx.moveTo(offset + S * 0.25, y); ctx.lineTo(offset + S * 0.25, y + S / 4); ctx.stroke()
      }
      break
    }
    case 'ice': {
      for (let i = 0; i < 3; i++) {
        const x = rand() * S, y = rand() * S
        ctx.beginPath()
        ctx.moveTo(x, y - 5); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 4, y)
        ctx.closePath(); ctx.stroke()
      }
      break
    }
    case 'root': {
      for (let i = 0; i < 2; i++) {
        ctx.beginPath()
        const y0 = rand() * S
        ctx.moveTo(0, y0)
        ctx.bezierCurveTo(S * 0.3, y0 + (rand() - 0.5) * S * 0.6, S * 0.7, y0 + (rand() - 0.5) * S * 0.6, S, rand() * S)
        ctx.stroke()
      }
      break
    }
    case 'flesh': {
      const cx = S * 0.5, cy = S * 0.5
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath()
        ctx.arc(cx, cy, i * S * 0.13, 0.3, Math.PI * 1.7)
        ctx.stroke()
      }
      break
    }
    case 'void': {
      const cx = S * 0.5, cy = S * 0.5
      ctx.beginPath()
      for (let a = 0; a < Math.PI * 4; a += 0.2) {
        const r = (a / (Math.PI * 4)) * S * 0.42
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r
        if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
      break
    }
    case 'gold': {
      const cx = S * 0.5, cy = S * 0.5, r = S * 0.28
      ctx.beginPath()
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy)
      ctx.closePath(); ctx.stroke()
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2); ctx.fill()
      break
    }
    case 'ash': {
      for (let i = 0; i < 10; i++) {
        ctx.globalAlpha = 0.4 + rand() * 0.5
        ctx.beginPath()
        ctx.arc(rand() * S, rand() * S, 0.8 + rand() * 1.6, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      break
    }
  }
}

export function tileTexture(biome: BiomeDef, tile: Tile, variant: number, size: number): HTMLCanvasElement {
  const key = `${biome.id}:${tile}:${variant}:${size}`
  const hit = cache.get(key)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  const dpr = Math.min(2, Math.max(1, Math.round(window.devicePixelRatio || 1)))
  canvas.width = Math.ceil(size * dpr)
  canvas.height = Math.ceil(size * dpr)
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.scale(dpr, dpr)
    const rand = prng(0x9e37 ^ (variant * 2654435761) ^ tile * 40503 ^ biome.id.charCodeAt(0) * 7919)
    if (tile === Tile.Wall) {
      ctx.fillStyle = biome.wall
      ctx.fillRect(0, 0, size, size)
      // No per-tile border: adjacent walls must fuse into one dark mass the way
      // the original's rock does, with the pattern reading as faint ink on top.
      ctx.globalAlpha = 0.3
      wallPattern(ctx, biome, size, rand)
      ctx.globalAlpha = 1
    } else if (tile === Tile.Chasm) {
      ctx.fillStyle = biome.chasm
      ctx.fillRect(0, 0, size, size)
      ctx.fillStyle = 'rgba(255,255,255,0.10)'
      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        ctx.arc(rand() * size, rand() * size, 0.6 + rand(), 0, Math.PI * 2)
        ctx.fill()
      }
    } else {
      ctx.fillStyle = biome.floor
      ctx.fillRect(0, 0, size, size)
      ctx.globalAlpha = 0.5
      floorPattern(ctx, biome, size, rand)
      ctx.globalAlpha = 1
    }
  }
  cache.set(key, canvas)
  return canvas
}

export function clearTileCache(): void { cache.clear() }
