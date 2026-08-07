import { describe, expect, it } from 'vitest'
import { Game } from '../src/core/game'
import { killUnit } from '../src/core/combat'
import { Tile } from '../src/core/types'

/**
 * Reachability audit of generated levels.
 *
 * The wizard walks; only a handful of spells cross a chasm. So every reward the
 * generator drops has to sit on ground the wizard can actually walk to, and the
 * walkable pocket he lands in has to be most of the map — being sealed into a
 * corner while loot glitters across a gap reads as a broken level, not a choice.
 */
interface RealmAudit {
  realm: number
  inner: number
  walkable: number
  strandedFloor: number
  strandedItems: number
  strandedEnemies: number
  strandedPortals: number
}

/** Walk a run through every realm without fighting, auditing each fresh level. */
function auditRun(seed: string, realms = 20): RealmAudit[] {
  const g = new Game(seed)
  g.newRun(seed)
  g.fx.enabled = false
  const out: RealmAudit[] = []

  for (let n = 0; n < realms; n++) {
    const lvl = g.level
    const reach = lvl.flowField([{ x: g.player.x, y: g.player.y }], false)
    const ok = (x: number, y: number) => reach[y * lvl.w + x] < 0x7ff0

    let inner = 0
    let walkable = 0
    let strandedFloor = 0
    for (let y = 1; y < lvl.h - 1; y++) {
      for (let x = 1; x < lvl.w - 1; x++) {
        inner++
        if (lvl.tiles[y * lvl.w + x] !== Tile.Floor) continue
        if (ok(x, y)) walkable++
        else strandedFloor++
      }
    }

    out.push({
      realm: g.run.realmIndex,
      inner,
      walkable,
      strandedFloor,
      strandedItems: lvl.items.filter(i => i && !ok(i.x, i.y)).length,
      strandedEnemies: g.enemies.filter(u => !u.flying && !ok(u.x, u.y)).length,
      strandedPortals: lvl.portals.filter(p => !ok(p.x, p.y)).length,
    })

    // Clear the realm the cheap way. Splitters spawn children as they die, so
    // keep sweeping until the realm actually reports itself clear.
    for (let sweep = 0; sweep < 40 && g.enemies.length; sweep++) {
      for (const u of g.enemies.slice()) killUnit(g, u)
    }
    const portal = g.level.portals[0]
    if (!portal) break
    g.level.placeUnit(g.player, portal.x, portal.y)
    if (!g.tryTakePortal()) break
  }
  return out
}

describe('level generation reachability', () => {
  const seeds = Array.from({ length: 120 }, (_, i) => `map-${i}`)
  const audits = seeds.flatMap(s => auditRun(s))

  it('audits a meaningful sample', () => {
    expect(audits.length).toBeGreaterThan(2000)
  })

  it('never strands loot, portals, or walking enemies behind a gap', () => {
    const bad = audits.filter(a => a.strandedItems || a.strandedPortals || a.strandedEnemies)
    if (bad.length) {
      console.log(`stranded content in ${bad.length}/${audits.length} realms:`)
      for (const a of bad.slice(0, 12)) {
        console.log(`  realm ${a.realm}: items=${a.strandedItems} portals=${a.strandedPortals} enemies=${a.strandedEnemies}`)
      }
    }
    expect(bad).toHaveLength(0)
  })

  it('leaves no walkable floor sealed off from the wizard', () => {
    const worst = audits.reduce((m, a) => Math.max(m, a.strandedFloor), 0)
    const bad = audits.filter(a => a.strandedFloor > 0)
    if (bad.length) console.log(`sealed floor in ${bad.length}/${audits.length} realms, worst ${worst} tiles`)
    expect(worst).toBe(0)
  })

  it('gives the wizard most of the map to move in', () => {
    const ratios = audits.map(a => a.walkable / a.inner).sort((x, y) => x - y)
    const min = ratios[0]
    const p05 = ratios[Math.floor(ratios.length * 0.05)]
    const median = ratios[Math.floor(ratios.length / 2)]
    console.log(`walkable share: min ${(min * 100).toFixed(1)}% p05 ${(p05 * 100).toFixed(1)}% median ${(median * 100).toFixed(1)}%`)
    expect(min).toBeGreaterThan(0.55)
  })
})
