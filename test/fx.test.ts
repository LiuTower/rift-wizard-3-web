import { describe, expect, it } from 'vitest'
import { Game } from '../src/core/game'
import { getSpellDefs } from '../src/core/registry'
import { validTarget } from '../src/core/spell'

/**
 * Animation timing.
 *
 * Logic resolves synchronously and appends effects to "beats"; the renderer
 * plays beats back at a fixed rate. The contract the player feels is: whatever
 * I just did animates *now*, and it animates before the monsters' replies. A
 * beat backlog breaks both — effects queue up seconds behind the board state,
 * so the wizard's fireball lands after the pack has already closed in.
 */

/** Advance the renderer clock by `seconds`, mirroring main.ts's frame loop. */
function render(g: Game, seconds: number, fps = 60): void {
  const dt = 1 / fps
  for (let t = 0; t < seconds; t += dt) {
    const wasBusy = g.fx.busy
    g.fx.tick(dt)
    if (wasBusy && !g.fx.busy) g.fx.prune()
  }
}

/**
 * Seconds before the effect the PLAYER just caused starts playing.
 *
 * Measured against the earliest queued beat, not the latest: a monster's reply
 * is supposed to wait its turn, whereas the wizard's own spell must be on screen
 * immediately. Measuring the latest effect would call correct ordering a bug.
 */
function latency(g: Game): number {
  if (!g.fx.list.length) return 0
  const first = g.fx.list.reduce((m, f) => Math.min(m, f.start), Infinity)
  return Math.max(0, first - g.fx.playhead) / g.fx.speed
}

/** Seconds the whole queued turn takes to finish animating. */
function turnSeconds(g: Game): number {
  return (g.fx.end - g.fx.playhead) / g.fx.speed
}

/** Is the wizard's first spell legal against this tile right now? */
function inRange(g: Game, foe: { x: number; y: number }): boolean {
  const s = g.player.spells[0]
  return !!s && validTarget(s, g, foe.x, foe.y)
}

function combatGame(seed = 'fx'): Game {
  const g = new Game(seed)
  g.newRun(seed)
  // a reliable, always-legal attack spell
  g.run.sp = 99
  g.learnSpell('magic_missile')
  // Drag one monster into range: these tests are about playback timing, not
  // about whether the generator happened to place a foe where we can hit it.
  const foe = g.enemies[0]
  if (foe) {
    for (let r = 2; r <= 6 && !inRange(g, foe); r++) {
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]) {
        const x = g.player.x + dx, y = g.player.y + dy
        if (!g.level.vacant(x, y, foe.flying)) continue
        g.level.placeUnit(foe, x, y)
        g.level.invalidateLOS()
        if (inRange(g, foe)) break
      }
    }
  }
  return g
}

/** Cast the wizard's first spell at any legal target. Returns false if none. */
function attack(g: Game): boolean {
  for (let i = 0; i < g.player.spells.length; i++) {
    if (!g.canCast(i)) continue
    const s = g.player.spells[i]
    for (const u of g.enemies) {
      if (validTarget(s, g, u.x, u.y) && g.castSpell(i, u.x, u.y)) return true
    }
  }
  return false
}

describe('animation timing', () => {
  it('plays a single action immediately', () => {
    const g = combatGame()
    expect(attack(g)).toBe(true)
    // the effect the player just caused must be on screen from the first frame
    expect(latency(g)).toBeLessThan(0.35)
  })

  it('does not build a backlog when the player acts faster than the animation', () => {
    const g = combatGame()
    const seen: number[] = []
    // Ten actions with only a sliver of rendering between them — exactly what
    // holding down a movement key or spamming a spell hotkey does.
    for (let n = 0; n < 10; n++) {
      if (!attack(g) && !g.passTurn()) break
      render(g, 0.05)
      seen.push(latency(g))
    }
    const worst = Math.max(...seen)
    if (worst >= 0.35) console.log(`fx latency per action: ${seen.map(v => v.toFixed(2)).join(' ')}`)
    expect(worst).toBeLessThan(0.35)
  })

  it('keeps the queue bounded while the player keeps acting', () => {
    const g = combatGame()
    for (let n = 0; n < 40; n++) {
      if (!attack(g) && !g.passTurn()) break
      render(g, 0.02)
    }
    // An unbounded queue means effects from dozens of turns ago are still parked
    expect(g.fx.list.length).toBeLessThan(400)
    expect(g.fx.beatIndex).toBeLessThan(200)
  })

  it('animates the wizard before the monsters that answer him', () => {
    const g = combatGame('fx-order')
    const before = g.fx.list.length
    expect(attack(g)).toBe(true)
    const mine = g.fx.list.slice(before, before + 1)[0]
    // anything a monster did this turn is queued strictly later
    const later = g.fx.list.slice(before + 1)
    expect(mine).toBeDefined()
    for (const f of later) expect(f.start).toBeGreaterThanOrEqual(mine.start)
  })

  it('finishes a turn of animation in well under a second', () => {
    const g = combatGame('fx-len')
    expect(attack(g)).toBe(true)
    expect(turnSeconds(g)).toBeLessThan(0.8)
  })

  it('does not stretch the turn just because the crowd is large', () => {
    // Steps share a beat, so animation length tracks what happened, not how many
    // creatures happened to walk.
    const g = combatGame('fx-crowd')
    expect(attack(g)).toBe(true)
    const walkers = g.fx.list.filter(f => f.kind === 'move')
    expect(walkers.length).toBeGreaterThan(1)
    const beats = new Set(walkers.map(f => f.start))
    expect(beats.size).toBe(1)
    expect(turnSeconds(g)).toBeLessThan(0.8)
  })

  it('slides walkers from their old tile, not their new one', () => {
    const g = combatGame('fx-slide')
    expect(attack(g)).toBe(true)
    const step = g.fx.list.find(f => f.kind === 'move' && f.unit !== g.player.uid)
    expect(step).toBeDefined()
    if (!step) return
    const walker = g.level.units.find(u => u.uid === step.unit)
    expect(walker).toBeDefined()
    // the fx records the origin; the unit already sits on the destination
    expect(step.x2).toBe(walker?.x)
    expect(step.y2).toBe(walker?.y)
    expect(`${step.x},${step.y}`).not.toBe(`${walker?.x},${walker?.y}`)
    // before its beat plays, it must render at the ORIGIN
    g.fx.playhead = 0
    const at = g.fx.moveOffsets().get(step.unit as number)
    expect(at).toEqual({ x: step.x, y: step.y })
  })

  it('has spells that actually emit effects', () => {
    // guards the whole suite: if casting stopped producing fx these tests would
    // pass vacuously
    const g = combatGame('fx-emit')
    expect(getSpellDefs().length).toBeGreaterThan(0)
    expect(attack(g)).toBe(true)
    expect(g.fx.list.length).toBeGreaterThan(0)
  })
})
