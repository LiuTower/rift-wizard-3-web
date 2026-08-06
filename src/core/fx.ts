import type { DamageType } from './types'
import { DAMAGE_COLORS } from './types'

export type FxKind =
  | 'damage' | 'float' | 'flash' | 'strike' | 'bolt' | 'beam'
  | 'area' | 'burst' | 'spawn' | 'death' | 'teleport' | 'charge' | 'ring'

export interface Fx {
  kind: FxKind
  x: number
  y: number
  x2?: number
  y2?: number
  text?: string
  color: string
  /** beat this effect starts on */
  start: number
  /** length in beats */
  life: number
  radius?: number
  tiles?: { x: number; y: number }[]
}

/**
 * Visual effect queue. Game logic resolves instantly and appends effects to
 * "beats"; the renderer plays beats back at a fixed rate, which is what makes
 * the turn feel animated without the simulation being async.
 */
export class FxQueue {
  list: Fx[] = []
  /** current beat that new effects attach to */
  beatIndex = 0
  /** renderer playhead, in beats */
  playhead = 0
  /** beats per second */
  speed = 14
  enabled = true

  clear(): void {
    this.list.length = 0
    this.beatIndex = 0
    this.playhead = 0
  }

  /** Advance the logical beat so subsequent effects play after current ones. */
  beat(n = 1): void { this.beatIndex += n }

  get end(): number {
    let e = 0
    for (const f of this.list) e = Math.max(e, f.start + f.life)
    return e
  }

  get busy(): boolean { return this.playhead < this.end }

  /** Drop everything that has finished playing. */
  prune(): void {
    if (this.list.length === 0) return
    if (!this.busy) {
      this.list.length = 0
      this.beatIndex = 0
      this.playhead = 0
      return
    }
    this.list = this.list.filter(f => f.start + f.life > this.playhead - 1)
  }

  private push(f: Fx): void {
    if (!this.enabled) return
    this.list.push(f)
  }

  damage(x: number, y: number, amount: number, type: DamageType): void {
    this.push({ kind: 'damage', x, y, text: String(amount), color: DAMAGE_COLORS[type], start: this.beatIndex, life: 8 })
    this.push({ kind: 'flash', x, y, color: DAMAGE_COLORS[type], start: this.beatIndex, life: 3 })
  }

  float(x: number, y: number, text: string, color: string): void {
    this.push({ kind: 'float', x, y, text, color, start: this.beatIndex, life: 8 })
  }

  flash(x: number, y: number, color: string): void {
    this.push({ kind: 'flash', x, y, color, start: this.beatIndex, life: 3 })
  }

  strike(x: number, y: number, color: string): void {
    this.push({ kind: 'strike', x, y, color, start: this.beatIndex, life: 4 })
  }

  bolt(x: number, y: number, x2: number, y2: number, color: string): void {
    this.push({ kind: 'bolt', x, y, x2, y2, color, start: this.beatIndex, life: 4 })
  }

  beam(x: number, y: number, x2: number, y2: number, color: string, weight = 1): void {
    this.push({ kind: 'beam', x, y, x2, y2, color, start: this.beatIndex, life: 4, radius: weight })
  }

  area(tiles: { x: number; y: number }[], color: string): void {
    if (!tiles.length) return
    this.push({ kind: 'area', x: tiles[0].x, y: tiles[0].y, tiles: tiles.slice(), color, start: this.beatIndex, life: 5 })
  }

  burst(x: number, y: number, radius: number, color: string): void {
    this.push({ kind: 'burst', x, y, radius, color, start: this.beatIndex, life: 5 })
  }

  ring(x: number, y: number, radius: number, color: string): void {
    this.push({ kind: 'ring', x, y, radius, color, start: this.beatIndex, life: 6 })
  }

  spawn(x: number, y: number, color: string): void {
    this.push({ kind: 'spawn', x, y, color, start: this.beatIndex, life: 6 })
  }

  death(x: number, y: number, color: string): void {
    this.push({ kind: 'death', x, y, color, start: this.beatIndex, life: 6 })
  }

  teleport(x: number, y: number, x2: number, y2: number, color: string): void {
    this.push({ kind: 'teleport', x, y, x2, y2, color, start: this.beatIndex, life: 5 })
  }

  charge(x: number, y: number, color: string): void {
    this.push({ kind: 'charge', x, y, color, start: this.beatIndex, life: 6 })
  }

  /** Jump to the end, used when the player wants to skip animations. */
  skip(): void { this.playhead = this.end }

  tick(dtSeconds: number): void {
    if (!this.busy) return
    this.playhead += dtSeconds * this.speed
  }
}
