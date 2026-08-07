import type { DamageType } from './types'
import { DAMAGE_COLORS } from './types'

export type FxKind =
  | 'damage' | 'float' | 'flash' | 'strike' | 'bolt' | 'beam'
  | 'area' | 'burst' | 'spawn' | 'death' | 'teleport' | 'charge' | 'ring' | 'move'

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
  /** uid of the creature this effect is bound to, for `move` */
  unit?: number
  /** sprite key, so a dying body can be faded out after it left the level */
  sprite?: string
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

  /** true when something was queued into the beat that is still open */
  private used = false

  clear(): void {
    this.list.length = 0
    this.beatIndex = 0
    this.playhead = 0
    this.used = false
  }

  /**
   * Close the current beat so later effects play after it.
   *
   * Two beats are deliberately not spent:
   *  - one nothing drew into, so a monster that did nothing costs no time;
   *  - one holding only steps, so a whole pack slides at once instead of queuing
   *    up — otherwise twenty monsters walking would stretch a single turn past a
   *    second and a half, scaling with the crowd rather than with what happened.
   */
  beat(): void {
    if (!this.used) return
    this.beatIndex++
    this.used = false
  }

  /**
   * Rebase the timeline for a fresh player action.
   *
   * The simulation is synchronous but playback is not, so a player who acts
   * faster than the animation plays would pile new effects onto beats far ahead
   * of the playhead. That backlog only grows: effects start arriving seconds
   * after the board already changed, so a fireball appears to land after the
   * pack has closed in. Acting again means "I have seen enough" — flush what is
   * left and start the new turn at beat zero.
   */
  catchUp(): void {
    this.playhead = this.end
    this.prune()
  }

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
      this.used = false
      return
    }
    this.list = this.list.filter(f => f.start + f.life > this.playhead - 1)
  }

  private push(f: Fx): void {
    if (!this.enabled) return
    this.list.push(f)
    // Steps do not claim the beat — see `beat()`.
    if (f.kind !== 'move') this.used = true
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

  /**
   * A creature coming apart. Carries its sprite so the renderer can fade the
   * body out: the unit is already gone from the level, and without the sprite the
   * corpse would blink out of existence the instant logic resolved, before its
   * own beat came up.
   */
  death(x: number, y: number, color: string, sprite?: string): void {
    this.push({ kind: 'death', x, y, color, sprite, start: this.beatIndex, life: 6 })
  }

  teleport(x: number, y: number, x2: number, y2: number, color: string): void {
    this.push({ kind: 'teleport', x, y, x2, y2, color, start: this.beatIndex, life: 5 })
  }

  charge(x: number, y: number, color: string): void {
    this.push({ kind: 'charge', x, y, color, start: this.beatIndex, life: 6 })
  }

  /**
   * A creature stepping from one tile to the next.
   *
   * Without this the board snaps units to their new tiles the instant logic
   * resolves, so the whole pack appears to move *before* the spell cast at them
   * has finished animating — the turn reads backwards.
   */
  move(uid: number, fromX: number, fromY: number, toX: number, toY: number): void {
    this.push({
      kind: 'move', x: fromX, y: fromY, x2: toX, y2: toY,
      unit: uid, color: '#000', start: this.beatIndex, life: 3,
    })
  }

  /**
   * Where each moving creature should be drawn right now, keyed by uid.
   * Built once per frame so unit drawing stays O(1) per unit.
   *
   * A step whose beat has not arrived yet pins the creature to its ORIGIN. Left
   * out of the map it would be drawn at its destination instead, then snap back
   * and slide again once its beat came up — worse than no animation at all.
   */
  moveOffsets(): Map<number, { x: number; y: number }> {
    const out = new Map<number, { x: number; y: number }>()
    for (const f of this.list) {
      if (f.kind !== 'move' || f.unit === undefined) continue
      const t = (this.playhead - f.start) / f.life
      if (t >= 1) continue
      if (t <= 0) { out.set(f.unit, { x: f.x, y: f.y }); continue }
      // ease-out: the step leaves quickly and lands softly
      const e = 1 - (1 - t) * (1 - t)
      out.set(f.unit, {
        x: f.x + ((f.x2 ?? f.x) - f.x) * e,
        y: f.y + ((f.y2 ?? f.y) - f.y) * e,
      })
    }
    return out
  }

  /** Jump to the end, used when the player wants to skip animations. */
  skip(): void { this.playhead = this.end }

  tick(dtSeconds: number): void {
    if (!this.busy) return
    this.playhead += dtSeconds * this.speed
  }
}
