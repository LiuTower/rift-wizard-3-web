import { describe, expect, it } from 'vitest'
import { Game } from '../src/core/game'
import { cheb } from '../src/core/geom'
import type { Unit } from '../src/core/unit'

/**
 * Pack movement.
 *
 * A crowd of monsters has to converge on the wizard. Individual monsters may
 * legitimately stall — a corridor only fits one at a time, and using that is a
 * real tactic — but the pack as a whole must close distance. What must never
 * happen is monsters trading places with each other forever: it looks like
 * motion, costs the player turns, and never brings anything closer.
 */

/** Clear the generated pack and drop `count` rats in a blob near the wizard. */
function crowd(seed: string, count: number, gap: number): { g: Game; foes: Unit[] } {
  const g = new Game(seed)
  g.newRun(seed)
  g.fx.enabled = false
  for (const u of g.enemies.slice()) g.level.removeUnit(u)

  // Find a patch of open floor at roughly `gap` tiles from the wizard, then pack
  // the rats into it shoulder to shoulder.
  const spots: { x: number; y: number }[] = []
  const reach = g.level.flowField([{ x: g.player.x, y: g.player.y }], false)
  for (const p of g.level.floorTiles()) {
    if (reach[p.y * g.level.w + p.x] >= 0x7ff0) continue
    const d = cheb(p.x, p.y, g.player.x, g.player.y)
    if (d < gap || d > gap + 2) continue
    if (!g.level.vacant(p.x, p.y, false)) continue
    spots.push(p)
  }
  // prefer a tight blob: sort by distance to the first candidate
  const anchor = spots[0]
  if (anchor) spots.sort((a, b) => cheb(a.x, a.y, anchor.x, anchor.y) - cheb(b.x, b.y, anchor.x, anchor.y))

  const foes: Unit[] = []
  for (const p of spots) {
    if (foes.length >= count) break
    if (!g.level.vacant(p.x, p.y, false)) continue
    const u = g.makeUnit('giant_rat')
    if (!u) break
    u.x = p.x; u.y = p.y
    g.level.addUnit(u)
    g.applyPassives(u)
    foes.push(u)
  }
  return { g, foes }
}

/** Sum of every living monster's distance to the wizard. */
function spread(g: Game, foes: Unit[]): number {
  let n = 0
  for (const u of foes) {
    if (!u.alive) continue
    n += cheb(u.x, u.y, g.player.x, g.player.y)
  }
  return n
}

describe('pack movement', () => {
  it('closes distance instead of trading places', () => {
    const { g, foes } = crowd('pack-close', 6, 7)
    expect(foes.length).toBeGreaterThanOrEqual(5)
    const start = spread(g, foes)

    // The wizard holds still; only the pack acts.
    const trace: number[] = []
    for (let turn = 0; turn < 12; turn++) {
      g.passTurn()
      trace.push(spread(g, foes))
    }
    const end = trace[trace.length - 1]
    if (end >= start) console.log(`pack spread per turn: ${start} -> ${trace.join(' ')}`)
    // twelve turns of six rats walking must visibly close the gap
    expect(end).toBeLessThan(start)
  })

  it('never has two monsters trade places', () => {
    const { g, foes } = crowd('pack-osc', 7, 6)
    expect(foes.length).toBeGreaterThanOrEqual(5)

    // A swap is the exact signature of the bug: two units end the turn on each
    // other's starting tiles. It moves nobody closer and costs the player a turn.
    // (Monsters going still once they surround the wizard is correct, so a plain
    // "positions repeated" check would flag healthy behaviour.)
    const swaps: string[] = []
    for (let turn = 0; turn < 14; turn++) {
      const before = new Map(foes.filter(u => u.alive).map(u => [u.uid, { x: u.x, y: u.y }]))
      g.passTurn()
      for (const a of foes) {
        if (!a.alive) continue
        const wasA = before.get(a.uid)
        if (!wasA) continue
        for (const b of foes) {
          if (b === a || !b.alive) continue
          const wasB = before.get(b.uid)
          if (!wasB) continue
          if (a.x === wasB.x && a.y === wasB.y && b.x === wasA.x && b.y === wasA.y) {
            swaps.push(`turn ${turn}: ${a.name}#${a.uid} <-> ${b.name}#${b.uid} at ${wasA.x},${wasA.y}/${wasB.x},${wasB.y}`)
          }
        }
      }
    }
    if (swaps.length) console.log(`place swaps:\n  ${swaps.join('\n  ')}`)
    expect(swaps).toHaveLength(0)
  })

  it('gets the pack into contact with the wizard', () => {
    // The end state that matters: a crowd released a few tiles away must actually
    // reach the wizard, not mill about at range.
    const { g, foes } = crowd('pack-reach', 8, 5)
    expect(foes.length).toBeGreaterThanOrEqual(5)
    for (let turn = 0; turn < 20; turn++) g.passTurn()
    const adjacent = foes.filter(u => u.alive && cheb(u.x, u.y, g.player.x, g.player.y) <= 1).length
    if (!adjacent) console.log(`nobody reached the wizard; distances ${foes.filter(u => u.alive).map(u => cheb(u.x, u.y, g.player.x, g.player.y)).join(' ')}`)
    expect(adjacent).toBeGreaterThan(0)
  })
})
