import { Tile, type DamageType, type Point, type Team } from './types'
import { DIRS8, line } from './geom'
import type { Unit } from './unit'
import type { RealmDef } from './realm'
import type { Game } from './game'

export interface Cloud {
  kind: string
  name: string
  x: number
  y: number
  duration: number
  damage: number
  damageType: DamageType
  color: string
  sprite: string
  /** clouds only hurt units not on this team (undefined = hurt everyone) */
  friendly?: Team
  /** extra effect when a unit ends its turn inside */
  onStand?: (u: Unit, g: Game) => void
}

export type GroundItemKind = 'component' | 'consumable' | 'shrine' | 'reward'

export interface GroundItem {
  x: number
  y: number
  kind: GroundItemKind
  /** component letter, consumable id or reward id */
  ref: string
  count?: number
  name: string
  sprite: string
  color: string
}

export interface Portal {
  x: number
  y: number
  realm: RealmDef
  taken: boolean
}

export interface Prop {
  x: number
  y: number
  kind: 'wall_ice' | 'crystal' | 'pillar'
  hp: number
  sprite: string
  color: string
}

/**
 * One battlefield. The whole map is always visible (as in the original) —
 * line of sight only gates spell targeting and monster casting.
 */
export class Level {
  readonly w: number
  readonly h: number
  readonly tiles: Uint8Array
  readonly units: Unit[] = []
  private readonly unitIdx: (Unit | undefined)[]
  readonly clouds: (Cloud | undefined)[]
  readonly items: (GroundItem | undefined)[]
  readonly portals: Portal[] = []
  /** decorative per-tile texture variant */
  readonly variant: Uint8Array
  private losCache = new Map<number, Uint8Array>()
  biome = 'stone'

  constructor(w: number, h: number) {
    this.w = w; this.h = h
    const n = w * h
    this.tiles = new Uint8Array(n)
    this.unitIdx = new Array(n)
    this.clouds = new Array(n)
    this.items = new Array(n)
    this.variant = new Uint8Array(n)
  }

  idx(x: number, y: number): number { return y * this.w + x }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h
  }

  get(x: number, y: number): Tile {
    if (!this.inBounds(x, y)) return Tile.Wall
    return this.tiles[y * this.w + x] as Tile
  }

  set(x: number, y: number, t: Tile): void {
    if (!this.inBounds(x, y)) return
    this.tiles[y * this.w + x] = t
    this.losCache.clear()
  }

  blocksSight(x: number, y: number): boolean {
    return this.get(x, y) === Tile.Wall
  }

  /** Can a unit stand here? Chasms only stop non-flyers. */
  passable(x: number, y: number, flying = false): boolean {
    const t = this.get(x, y)
    if (t === Tile.Wall) return false
    if (t === Tile.Chasm && !flying) return false
    return true
  }

  /** Free for a unit to move into: passable and unoccupied. */
  vacant(x: number, y: number, flying = false): boolean {
    return this.passable(x, y, flying) && this.unitIdx[y * this.w + x] === undefined
  }

  unitAt(x: number, y: number): Unit | undefined {
    if (!this.inBounds(x, y)) return undefined
    return this.unitIdx[y * this.w + x]
  }

  cloudAt(x: number, y: number): Cloud | undefined {
    if (!this.inBounds(x, y)) return undefined
    return this.clouds[y * this.w + x]
  }

  itemAt(x: number, y: number): GroundItem | undefined {
    if (!this.inBounds(x, y)) return undefined
    return this.items[y * this.w + x]
  }

  portalAt(x: number, y: number): Portal | undefined {
    return this.portals.find(p => p.x === x && p.y === y)
  }

  addUnit(u: Unit): void {
    this.units.push(u)
    this.unitIdx[u.y * this.w + u.x] = u
  }

  removeUnit(u: Unit): void {
    const i = this.units.indexOf(u)
    if (i >= 0) this.units.splice(i, 1)
    if (this.unitIdx[u.y * this.w + u.x] === u) this.unitIdx[u.y * this.w + u.x] = undefined
  }

  placeUnit(u: Unit, x: number, y: number): void {
    if (this.unitIdx[u.y * this.w + u.x] === u) this.unitIdx[u.y * this.w + u.x] = undefined
    u.x = x; u.y = y
    this.unitIdx[y * this.w + x] = u
  }

  setCloud(c: Cloud): void {
    if (!this.inBounds(c.x, c.y) || this.get(c.x, c.y) === Tile.Wall) return
    this.clouds[c.y * this.w + c.x] = c
  }

  removeCloud(x: number, y: number): void {
    this.clouds[y * this.w + x] = undefined
  }

  setItem(it: GroundItem): void {
    this.items[it.y * this.w + it.x] = it
  }

  removeItem(x: number, y: number): void {
    this.items[y * this.w + x] = undefined
  }

  /** Symmetric permissive line of sight: clear if either traced line is unobstructed. */
  hasLOS(x0: number, y0: number, x1: number, y1: number): boolean {
    return this.losFrom(x0, y0)[y1 * this.w + x1] === 1
  }

  /** Bitmap of tiles visible from (x,y). Cached until tiles change. */
  losFrom(x: number, y: number): Uint8Array {
    const key = y * this.w + x
    const hit = this.losCache.get(key)
    if (hit) return hit
    const map = new Uint8Array(this.w * this.h)
    for (let ty = 0; ty < this.h; ty++) {
      for (let tx = 0; tx < this.w; tx++) {
        if (map[ty * this.w + tx]) continue
        if (this.traceClear(x, y, tx, ty)) {
          map[ty * this.w + tx] = 1
        } else if (this.traceClear(tx, ty, x, y)) {
          map[ty * this.w + tx] = 1
        }
      }
    }
    if (this.losCache.size > 64) this.losCache.clear()
    this.losCache.set(key, map)
    return map
  }

  private traceClear(x0: number, y0: number, x1: number, y1: number): boolean {
    const pts = line(x0, y0, x1, y1)
    for (let i = 1; i < pts.length - 1; i++) {
      if (this.blocksSight(pts[i].x, pts[i].y)) return false
    }
    return true
  }

  /** Tiles a projectile passes through before hitting a wall. */
  raycast(x0: number, y0: number, x1: number, y1: number, maxLen = 99): Point[] {
    const pts = line(x0, y0, x1, y1)
    const out: Point[] = []
    for (let i = 1; i < pts.length && out.length < maxLen; i++) {
      const p = pts[i]
      if (!this.inBounds(p.x, p.y) || this.blocksSight(p.x, p.y)) break
      out.push(p)
    }
    return out
  }

  /**
   * Breadth-first distance from every tile to the nearest target, over terrain
   * only.
   *
   * Occupancy is deliberately NOT part of the cost: charging a unit extra for
   * standing on its own tile inflates its own distance, and a mover comparing
   * its tile against its neighbours then oscillates between two squares
   * forever. Callers that want to avoid crowds add their own tie-break
   * penalty when picking a neighbour.
   */
  flowField(targets: readonly Point[], flying: boolean): Int16Array {
    const n = this.w * this.h
    const UNREACHED = 0x7ff0
    const dist = new Int16Array(n).fill(UNREACHED)
    const queue: number[] = []
    for (const t of targets) {
      if (!this.inBounds(t.x, t.y)) continue
      const i = t.y * this.w + t.x
      if (dist[i] === 0) continue
      dist[i] = 0
      queue.push(i)
    }
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head]
      const cd = dist[cur]
      const cx = cur % this.w, cy = (cur - cx) / this.w
      for (const [dx, dy] of DIRS8) {
        const nx = cx + dx, ny = cy + dy
        if (!this.inBounds(nx, ny)) continue
        if (!this.passable(nx, ny, flying)) continue
        const ni = ny * this.w + nx
        if (dist[ni] !== UNREACHED) continue
        dist[ni] = cd + 1
        queue.push(ni)
      }
    }
    return dist
  }

  /** Every floor tile, in row order. */
  *floorTiles(): Generator<Point> {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.tiles[y * this.w + x] === Tile.Floor) yield { x, y }
      }
    }
  }

  invalidateLOS(): void { this.losCache.clear() }
}
