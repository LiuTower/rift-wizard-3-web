import type { Game } from '../core/game'
import { Tile, DAMAGE_COLORS } from '../core/types'
import { BIOMES } from '../core/realm'
import { ballPoints } from '../core/geom'
import { drawSprite, fallbackSprite, type SpriteDef } from './sprite'
import { tileTexture } from './tiles'
import { getSprites } from '../core/registry'
import type { Fx } from '../core/fx'
import type { Unit } from '../core/unit'

const FRAME_COLOR = '#d8d8e0'

export class BoardRenderer {
  readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  tile = 32
  originX = 0
  originY = 0
  private dpr = 1
  private spriteCache: Record<string, SpriteDef> = {}

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context unavailable')
    this.ctx = ctx
  }

  private sprite(key: string): SpriteDef {
    const hit = this.spriteCache[key]
    if (hit) return hit
    const all = getSprites()
    const def = all[key] ?? fallbackSprite(key)
    this.spriteCache[key] = def
    return def
  }

  /** Fit the board to the available box, keeping tiles on whole pixels. */
  layout(g: Game, availW: number, availH: number): void {
    const w = g.level.w, h = g.level.h
    const pad = 14
    // 10px is the floor where sprites still read; below the board would just
    // overflow its column and slide under the side panels.
    const tile = Math.max(10, Math.floor(Math.min((availW - pad * 2) / w, (availH - pad * 2) / h)))
    this.tile = tile
    const cssW = w * tile + pad * 2
    const cssH = h * tile + pad * 2
    this.dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
    this.canvas.width = Math.ceil(cssW * this.dpr)
    this.canvas.height = Math.ceil(cssH * this.dpr)
    this.canvas.style.width = `${cssW}px`
    this.canvas.style.height = `${cssH}px`
    this.originX = pad
    this.originY = pad
  }

  tileAt(clientX: number, clientY: number): { x: number; y: number } | undefined {
    const rect = this.canvas.getBoundingClientRect()
    const px = clientX - rect.left - this.originX
    const py = clientY - rect.top - this.originY
    const x = Math.floor(px / this.tile)
    const y = Math.floor(py / this.tile)
    if (x < 0 || y < 0) return undefined
    return { x, y }
  }

  draw(g: Game): void {
    const ctx = this.ctx
    const T = this.tile
    const lvl = g.level
    const biome = BIOMES.find(b => b.id === lvl.biome) ?? BIOMES[0]

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    // frame
    ctx.strokeStyle = FRAME_COLOR
    ctx.lineWidth = 1.4
    roundRect(ctx, 4, 4, lvl.w * T + this.originX * 2 - 8, lvl.h * T + this.originY * 2 - 8, 8)
    ctx.stroke()

    ctx.translate(this.originX, this.originY)

    // terrain
    for (let y = 0; y < lvl.h; y++) {
      for (let x = 0; x < lvl.w; x++) {
        const t = lvl.tiles[y * lvl.w + x] as Tile
        const tex = tileTexture(biome, t, lvl.variant[y * lvl.w + x] % 8, T)
        ctx.drawImage(tex, x * T, y * T, T, T)
      }
    }

    // clouds
    for (const c of lvl.clouds) {
      if (!c) continue
      ctx.globalAlpha = 0.42
      drawSprite(ctx, c.sprite, this.sprite(c.sprite), c.x * T, c.y * T, T, { tint: c.color, tintAmount: 0.5 })
      ctx.globalAlpha = 1
    }

    // ground items
    for (const it of lvl.items) {
      if (!it) continue
      drawSprite(ctx, it.sprite, this.sprite(it.sprite), it.x * T + T * 0.15, it.y * T + T * 0.15, T * 0.7)
      if ((it.count ?? 1) > 1) {
        ctx.font = `bold ${Math.round(T * 0.32)}px ui-monospace, monospace`
        ctx.fillStyle = it.color
        ctx.textAlign = 'right'
        ctx.fillText(String(it.count), it.x * T + T - 2, it.y * T + T - 2)
        ctx.textAlign = 'left'
      }
    }

    // portals
    const open = g.cleared
    for (const p of lvl.portals) {
      const pulse = open ? 0.75 + Math.sin(performance.now() / 260) * 0.25 : 0.32
      ctx.globalAlpha = pulse
      drawSprite(ctx, 'portal', this.sprite('portal'), p.x * T, p.y * T, T, { tint: p.realm.biome.wallInk, tintAmount: 0.45 })
      ctx.globalAlpha = 1
      ctx.font = `bold ${Math.round(T * 0.34)}px ui-monospace, monospace`
      ctx.fillStyle = open ? '#ffd84a' : '#6a6a72'
      ctx.textAlign = 'center'
      ctx.fillText(String(p.realm.index), p.x * T + T / 2, p.y * T + T * 0.95)
      ctx.textAlign = 'left'
    }

    // tutorial: pulse the tiles the current step points at
    const tut = g.tutorial
    if (tut && !tut.done) {
      const pulse = 0.45 + Math.sin(performance.now() / 240) * 0.3
      ctx.strokeStyle = '#ffd84a'
      ctx.lineWidth = 2
      ctx.globalAlpha = pulse
      for (const p of tut.highlight) {
        ctx.strokeRect(p.x * T + 1, p.y * T + 1, T - 2, T - 2)
      }
      ctx.globalAlpha = 1
    }

    // aiming overlay under units
    if (g.mode === 'aim' && g.aim) this.drawAim(g, ctx)

    // units: big ones last so they overlap correctly. Walking creatures are drawn
    // at their animated position, which lags the logical tile until their beat
    // plays — that is what keeps a turn reading in the order it happened.
    const moves = g.fx.moveOffsets()
    const units = lvl.units.slice().sort((a, b) => (a.big ? 1 : 0) - (b.big ? 1 : 0))
    for (const u of units) {
      if (!u.alive) continue
      this.drawUnit(g, ctx, u, moves.get(u.uid))
    }

    // effects
    for (const f of g.fx.list) {
      const t = (g.fx.playhead - f.start) / f.life
      if (t < 0 || t > 1) continue
      this.drawFx(ctx, f, t)
    }

    // hover / examine
    if (g.hover && lvl.inBounds(g.hover.x, g.hover.y)) {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.2
      ctx.globalAlpha = 0.75
      ctx.strokeRect(g.hover.x * T + 0.5, g.hover.y * T + 0.5, T - 1, T - 1)
      ctx.globalAlpha = 1
    }
  }

  private drawUnit(g: Game, ctx: CanvasRenderingContext2D, u: Unit, at?: { x: number; y: number }): void {
    const T = this.tile
    const size = u.big ? T * 2 : T
    // `at` is the animated position mid-step; everything below draws from these.
    const ux = at?.x ?? u.x
    const uy = at?.y ?? u.y
    const px = u.big ? ux * T - T * 0.5 : ux * T
    const py = u.big ? uy * T - T * 0.5 : uy * T

    let tint: string | undefined
    let tintAmount = 0.5
    const frozen = u.buffOf('frozen') ?? u.buffOf('petrified') ?? u.buffOf('glassified')
    if (frozen) { tint = frozen.color; tintAmount = 0.55 }
    else if (u.hasBuff('burning')) { tint = '#ff5219'; tintAmount = 0.35 }
    else if (u.hasBuff('poisoned')) { tint = '#5ad04a'; tintAmount = 0.3 }
    else if (u.hasBuff('berserk')) { tint = '#ff5a5a'; tintAmount = 0.35 }

    // Sit the creature on a dark pad so it reads against textured walls.
    const cx = px + size / 2, cy = py + size / 2
    const pad = ctx.createRadialGradient(cx, cy, size * 0.1, cx, cy, size * 0.55)
    pad.addColorStop(0, 'rgba(0,0,0,0.72)')
    pad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = pad
    ctx.fillRect(px, py, size, size)
    drawSprite(ctx, u.sprite, this.sprite(u.sprite), px, py, size, { flip: u.facing, tint, tintAmount })

    // team marker: player-side units get a small green pip
    if (u.team === 'player' && !u.isPlayer) {
      ctx.fillStyle = '#7affa0'
      ctx.beginPath()
      ctx.arc(ux * T + 3.5, uy * T + 3.5, 2, 0, Math.PI * 2)
      ctx.fill()
    }

    if (u.charging) {
      ctx.strokeStyle = '#ff6a6a'
      ctx.lineWidth = 1.6
      const r = T * 0.48
      ctx.beginPath()
      ctx.arc(ux * T + T / 2, uy * T + T / 2, r, 0, Math.PI * 2)
      ctx.stroke()
    }

    if (u.shields > 0) {
      ctx.strokeStyle = '#c8d8ff'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.arc(ux * T + T / 2, uy * T + T / 2, T * 0.44, 0, Math.PI * 2)
      ctx.stroke()
    }

    // hp bar, only when hurt (as in the original)
    const max = u.effectiveMaxHP
    if (u.hp < max) {
      const w = (u.big ? T * 2 : T) - 4
      const frac = Math.max(0, u.hp / max)
      const barY = py + size - 3
      ctx.fillStyle = '#3a0a0a'
      ctx.fillRect(px + 2, barY, w, 2.5)
      ctx.fillStyle = u.isPlayer ? '#ff4d4d' : '#e02b2b'
      ctx.fillRect(px + 2, barY, w * frac, 2.5)
    }

    if (u.isPlayer) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 1
      ctx.strokeRect(ux * T + 0.5, uy * T + 0.5, T - 1, T - 1)
    }
  }

  private drawAim(g: Game, ctx: CanvasRenderingContext2D): void {
    const T = this.tile
    const aim = g.aim
    if (!aim) return
    const spell = aim.kind === 'spell' ? g.player.spells[aim.spellIdx] : undefined
    const lvl = g.level

    // range shading
    const range = spell ? spell.range : 8
    if (range > 0) {
      ctx.globalAlpha = 0.1
      ctx.fillStyle = spell?.def.color ?? '#9ad0ff'
      for (const p of ballPoints(g.player.x, g.player.y, range)) {
        if (!lvl.inBounds(p.x, p.y)) continue
        if (!g.targetValid(p.x, p.y)) continue
        ctx.fillRect(p.x * T, p.y * T, T, T)
      }
      ctx.globalAlpha = 1
    }

    const { x, y } = aim
    const valid = g.targetValid(x, y)

    // area of effect preview
    if (spell?.def.aoe) {
      const tiles = spell.def.aoe(spell, g, x, y)
      ctx.globalAlpha = 0.26
      ctx.fillStyle = spell.def.color ?? '#ffffff'
      for (const p of tiles) {
        if (!lvl.inBounds(p.x, p.y)) continue
        ctx.fillRect(p.x * T, p.y * T, T, T)
      }
      ctx.globalAlpha = 1
    }

    // ray from the wizard
    ctx.strokeStyle = valid ? (spell?.def.color ?? '#ffffff') : '#ff5a5a'
    ctx.lineWidth = 1.2
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(g.player.x * T + T / 2, g.player.y * T + T / 2)
    ctx.lineTo(x * T + T / 2, y * T + T / 2)
    ctx.stroke()
    ctx.setLineDash([])

    // cursor
    ctx.strokeStyle = valid ? '#ffffff' : '#ff5a5a'
    ctx.lineWidth = 2
    ctx.strokeRect(x * T + 1, y * T + 1, T - 2, T - 2)
  }

  private drawFx(ctx: CanvasRenderingContext2D, f: Fx, t: number): void {
    const T = this.tile
    const cx = f.x * T + T / 2
    const cy = f.y * T + T / 2
    const ease = 1 - (1 - t) * (1 - t)

    switch (f.kind) {
      case 'damage':
      case 'float': {
        ctx.globalAlpha = 1 - t * t
        ctx.font = `bold ${Math.round(T * 0.46)}px ui-monospace, monospace`
        ctx.textAlign = 'center'
        ctx.lineWidth = 3
        ctx.strokeStyle = '#000'
        const ty = cy - T * 0.2 - ease * T * 0.7
        ctx.strokeText(f.text ?? '', cx, ty)
        ctx.fillStyle = f.color
        ctx.fillText(f.text ?? '', cx, ty)
        ctx.textAlign = 'left'
        ctx.globalAlpha = 1
        break
      }
      case 'flash': {
        ctx.globalAlpha = (1 - t) * 0.55
        ctx.fillStyle = f.color
        ctx.fillRect(f.x * T, f.y * T, T, T)
        ctx.globalAlpha = 1
        break
      }
      case 'strike': {
        ctx.globalAlpha = 1 - t
        ctx.strokeStyle = f.color
        ctx.lineWidth = 2.4
        const r = T * 0.36
        ctx.beginPath()
        ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r)
        ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r)
        ctx.stroke()
        ctx.globalAlpha = 1
        break
      }
      case 'bolt': {
        const tx = (f.x2 ?? f.x) * T + T / 2
        const ty = (f.y2 ?? f.y) * T + T / 2
        const hx = cx + (tx - cx) * Math.min(1, ease * 1.4)
        const hy = cy + (ty - cy) * Math.min(1, ease * 1.4)
        ctx.globalAlpha = 1 - t * 0.6
        ctx.strokeStyle = f.color
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(cx, cy); ctx.lineTo(hx, hy)
        ctx.stroke()
        ctx.fillStyle = f.color
        ctx.beginPath()
        ctx.arc(hx, hy, T * 0.14, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
        break
      }
      case 'beam': {
        const tx = (f.x2 ?? f.x) * T + T / 2
        const ty = (f.y2 ?? f.y) * T + T / 2
        ctx.globalAlpha = (1 - t) * 0.9
        ctx.strokeStyle = f.color
        ctx.lineWidth = (f.radius ?? 1) * T * 0.22
        ctx.beginPath()
        ctx.moveTo(cx, cy); ctx.lineTo(tx, ty)
        ctx.stroke()
        ctx.globalAlpha = 1
        break
      }
      case 'area': {
        ctx.globalAlpha = (1 - t) * 0.6
        ctx.fillStyle = f.color
        for (const p of f.tiles ?? []) ctx.fillRect(p.x * T, p.y * T, T, T)
        ctx.globalAlpha = 1
        break
      }
      case 'burst': {
        ctx.globalAlpha = 1 - t
        ctx.strokeStyle = f.color
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(cx, cy, (f.radius ?? 2) * T * ease, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = 1
        break
      }
      case 'ring': {
        ctx.globalAlpha = 1 - t
        ctx.strokeStyle = f.color
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(cx, cy, (f.radius ?? 2) * T, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = 1
        break
      }
      case 'spawn': {
        ctx.globalAlpha = 1 - t
        ctx.strokeStyle = f.color
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(cx, cy, T * (1 - ease) * 1.2 + T * 0.2, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = 1
        break
      }
      case 'death': {
        // The unit left the level the moment logic resolved; fade its body here
        // so it does not blink out before this beat plays.
        if (f.sprite) {
          ctx.globalAlpha = (1 - t) * 0.8
          drawSprite(ctx, f.sprite, this.sprite(f.sprite), f.x * T, f.y * T, T, { tint: f.color, tintAmount: 0.4 })
        }
        ctx.globalAlpha = 1 - t
        ctx.fillStyle = f.color
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2
          const d = ease * T * 0.7
          ctx.beginPath()
          ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2.2 * (1 - t), 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
        break
      }
      case 'teleport': {
        const tx = (f.x2 ?? f.x) * T + T / 2
        const ty = (f.y2 ?? f.y) * T + T / 2
        ctx.globalAlpha = 1 - t
        ctx.strokeStyle = f.color
        ctx.lineWidth = 1.6
        ctx.beginPath(); ctx.arc(cx, cy, T * 0.4 * (1 - ease) + 2, 0, Math.PI * 2); ctx.stroke()
        ctx.beginPath(); ctx.arc(tx, ty, T * 0.4 * ease + 2, 0, Math.PI * 2); ctx.stroke()
        ctx.setLineDash([3, 3])
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tx, ty); ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1
        break
      }
      case 'charge': {
        ctx.globalAlpha = 0.8 - t * 0.6
        ctx.strokeStyle = f.color
        ctx.lineWidth = 2
        const pulse = 0.3 + Math.abs(Math.sin(t * Math.PI * 3)) * 0.25
        ctx.beginPath()
        ctx.arc(cx, cy, T * pulse, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = 1
        break
      }
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
}

export { DAMAGE_COLORS }
