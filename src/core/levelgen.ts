import { RNG } from './rng'
import { Tile, COMPONENT_IDS, type ComponentId } from './types'
import { Level, type GroundItem } from './level'
import type { RealmDef } from './realm'
import type { Game } from './game'
import { getConsumables, getUnitDef } from './registry'
import { COMPONENTS } from './types'
import { cheb, DIRS8 } from './geom'

export const LEVEL_W = 28
export const LEVEL_H = 21

/** Carve wall and chasm blobs, then guarantee the walkable area is connected. */
function carve(rng: RNG, lvl: Level, realm: RealmDef): void {
  const { w, h } = lvl
  for (let x = 0; x < w; x++) { lvl.tiles[x] = Tile.Wall; lvl.tiles[(h - 1) * w + x] = Tile.Wall }
  for (let y = 0; y < h; y++) { lvl.tiles[y * w] = Tile.Wall; lvl.tiles[y * w + w - 1] = Tile.Wall }

  const area = (w - 2) * (h - 2)
  const wallTarget = Math.floor(area * (0.16 + rng.next() * 0.12))
  const chasmTarget = Math.floor(area * (realm.difficulty >= 3 ? 0.02 + rng.next() * 0.06 : 0))

  const blob = (target: number, tile: Tile) => {
    let painted = 0
    let guard = 0
    while (painted < target && guard++ < 4000) {
      let x = rng.range(1, w - 2)
      let y = rng.range(1, h - 2)
      const len = rng.range(2, 12)
      for (let i = 0; i < len && painted < target; i++) {
        if (x < 1 || y < 1 || x > w - 2 || y > h - 2) break
        const idx = y * w + x
        if (lvl.tiles[idx] === Tile.Floor) { lvl.tiles[idx] = tile; painted++ }
        const [dx, dy] = rng.pick(DIRS8)
        x += dx; y += dy
      }
    }
  }
  blob(wallTarget, Tile.Wall)
  blob(chasmTarget, Tile.Chasm)

  // keep the largest walkable region, wall off islands
  const seen = new Uint8Array(w * h)
  let best: number[] = []
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const start = y * w + x
      if (seen[start] || lvl.tiles[start] !== Tile.Floor) continue
      const region: number[] = []
      const stack = [start]
      seen[start] = 1
      while (stack.length) {
        const cur = stack.pop() as number
        region.push(cur)
        const cx = cur % w, cy = (cur - cx) / w
        for (const [dx, dy] of DIRS8) {
          const nx = cx + dx, ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const ni = ny * w + nx
          if (seen[ni] || lvl.tiles[ni] !== Tile.Floor) continue
          seen[ni] = 1
          stack.push(ni)
        }
      }
      if (region.length > best.length) best = region
    }
  }
  const keep = new Uint8Array(w * h)
  for (const i of best) keep[i] = 1
  for (let i = 0; i < w * h; i++) {
    if (lvl.tiles[i] === Tile.Floor && !keep[i]) lvl.tiles[i] = Tile.Wall
  }
  for (let i = 0; i < w * h; i++) lvl.variant[i] = rng.int(8)
  lvl.biome = realm.biome.id
}

function pickSpread(rng: RNG, spots: { x: number; y: number }[], count: number, minGap: number): { x: number; y: number }[] {
  const chosen: { x: number; y: number }[] = []
  const pool = rng.shuffle(spots.slice())
  for (const p of pool) {
    if (chosen.length >= count) break
    if (chosen.every(c => cheb(c.x, c.y, p.x, p.y) >= minGap)) chosen.push(p)
  }
  // relax the gap if the map is too cramped
  for (const p of pool) {
    if (chosen.length >= count) break
    if (!chosen.some(c => c.x === p.x && c.y === p.y)) chosen.push(p)
  }
  return chosen
}

function componentDrop(rng: RNG, realm: RealmDef): ComponentId {
  // biome affinity: favour components whose colour matches the realm's theme
  const affine: Partial<Record<string, ComponentId[]>> = {
    hell: ['C', 'B'], crypt: ['U', 'B'], rime: ['I'], thicket: ['T'], void: ['O', 'U'],
    heaven: ['H'], foundry: ['O', 'S'], flesh: ['B', 'T'], swarm: ['T', 'S'], stone: ['O', 'S'],
  }
  const pref = affine[realm.biome.id] ?? []
  if (pref.length && rng.chance(0.55)) return rng.pick(pref)
  return rng.pick(COMPONENT_IDS)
}

function makeComponentItem(rng: RNG, realm: RealmDef, x: number, y: number, count = 1): GroundItem {
  const id = componentDrop(rng, realm)
  const info = COMPONENTS[id]
  return { x, y, kind: 'component', ref: id, count, name: info.name, sprite: info.sprite, color: info.color }
}

/** Build and populate a level for the given realm. */
export function buildLevel(g: Game, realm: RealmDef): Level {
  const rng = new RNG(realm.seed)
  const lvl = new Level(LEVEL_W, LEVEL_H)
  carve(rng, lvl, realm)

  const floors = [...lvl.floorTiles()]
  if (!floors.length) throw new Error('level generation produced no floor')

  // wizard start
  const start = rng.pick(floors)
  g.level = lvl
  lvl.placeUnit(g.player, start.x, start.y)
  lvl.addUnit(g.player)

  // Everything must spawn where the wizard can actually reach it on foot.
  // A flyer or a stationary gate stranded across a chasm can never be killed,
  // which locks the realm's portals shut forever.
  const reach = lvl.flowField([{ x: start.x, y: start.y }], false)
  const walkable = floors.filter(p => reach[p.y * lvl.w + p.x] < 0x7ff0)

  // Keep packs away from the wizard's start and spread them out: a single blob
  // of everything rushing turn one is unwinnable and unlike the original.
  const far = walkable.filter(p => cheb(p.x, p.y, start.x, start.y) >= 9)
  const spawnSpots = far.length > 12 ? far : walkable.filter(p => cheb(p.x, p.y, start.x, start.y) >= 5)

  // monsters: cluster each species around a few anchor points
  for (const [id, count] of Object.entries(realm.counts)) {
    const def = getUnitDef(id)
    if (!def) continue
    const anchors = pickSpread(rng, spawnSpots, Math.max(1, Math.ceil(count / 3)), 6)
    let placed = 0
    for (const anchor of anchors) {
      const per = Math.ceil(count / anchors.length)
      for (let i = 0; i < per && placed < count; i++) {
        const u = g.makeUnit(id)
        if (!u) break
        // ground-reachable even for flyers, so the fight can always be joined
        const spot = nearbyVacant(g, lvl, anchor.x, anchor.y, false, rng)
        if (!spot) continue
        u.x = spot.x; u.y = spot.y
        lvl.addUnit(u)
        g.applyPassives(u)
        placed++
      }
    }
  }

  // boss
  if (realm.boss) {
    const u = g.makeUnit(realm.boss)
    if (u) {
      const anchors = pickSpread(rng, spawnSpots, 1, 1)
      const anchor = anchors[0] ?? rng.pick(walkable)
      const spot = nearbyVacant(g, lvl, anchor.x, anchor.y, false, rng)
      if (spot) {
        u.x = spot.x; u.y = spot.y
        lvl.addUnit(u)
        g.applyPassives(u)
      }
    }
  }

  // loot: components always, plus the realm reward
  const lootSpots = pickSpread(rng, floors.filter(p => cheb(p.x, p.y, start.x, start.y) >= 3), 10, 3)
  let li = 0
  const componentCount = realm.reward === 'components' ? rng.range(5, 7) : rng.range(3, 4)
  for (let i = 0; i < componentCount && li < lootSpots.length; i++) {
    const p = lootSpots[li++]
    lvl.setItem(makeComponentItem(rng, realm, p.x, p.y))
  }

  const potionPool = getConsumables()
  const potionCount = realm.reward === 'consumables' ? rng.range(3, 4) : rng.range(1, 2)
  for (let i = 0; i < potionCount && li < lootSpots.length && potionPool.length; i++) {
    const p = lootSpots[li++]
    const def = rng.pickWeighted(potionPool, c => c.weight ?? 1)
    lvl.setItem({ x: p.x, y: p.y, kind: 'consumable', ref: def.id, name: def.name, sprite: def.sprite, color: def.color })
  }

  if (realm.reward === 'skillpoint' && li < lootSpots.length) {
    const p = lootSpots[li++]
    lvl.setItem({ x: p.x, y: p.y, kind: 'shrine', ref: 'sp', name: '远古神龛', sprite: 'shrine', color: '#ffd84a' })
  }
  if (realm.reward === 'trove') {
    for (let i = 0; i < 2 && li < lootSpots.length; i++) {
      const p = lootSpots[li++]
      lvl.setItem(makeComponentItem(rng, realm, p.x, p.y, 2))
    }
  }

  return lvl
}

function nearbyVacant(g: Game, lvl: Level, x: number, y: number, flying: boolean, rng: RNG): { x: number; y: number } | undefined {
  if (lvl.vacant(x, y, flying)) return { x, y }
  for (let r = 1; r <= 5; r++) {
    const ring: { x: number; y: number }[] = []
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        if (lvl.vacant(x + dx, y + dy, flying)) ring.push({ x: x + dx, y: y + dy })
      }
    }
    if (ring.length) return rng.pick(ring)
  }
  return undefined
}

/** Place the portals leading to the next realm options. */
export function placePortals(g: Game, realms: RealmDef[]): void {
  const lvl = g.level
  // Portals must be walkable-to, or a cleared realm becomes a dead end.
  const reach = lvl.flowField([{ x: g.player.x, y: g.player.y }], false)
  const floors = [...lvl.floorTiles()].filter(p =>
    reach[p.y * lvl.w + p.x] < 0x7ff0
    && cheb(p.x, p.y, g.player.x, g.player.y) >= 5
    && !lvl.unitAt(p.x, p.y) && !lvl.itemAt(p.x, p.y))
  const spots = pickSpread(g.rng, floors, realms.length, 7)
  lvl.portals.length = 0
  realms.forEach((realm, i) => {
    const p = spots[i] ?? spots[spots.length - 1]
    if (!p) return
    lvl.portals.push({ x: p.x, y: p.y, realm, taken: false })
  })
}
