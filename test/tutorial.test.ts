import { describe, expect, it } from 'vitest'
import { Game } from '../src/core/game'
import { Tutorial, startTutorial, TUTORIAL_STEP_COUNT } from '../src/core/tutorial'
import { validTarget } from '../src/core/spell'
import { cheb } from '../src/core/geom'
import { getArtifact } from '../src/core/registry'

/**
 * The tutorial promises a fixed flow: at every step there is exactly one thing
 * to do, and doing it advances the script. This driver plays the whole thing the
 * way a player would — only through public actions, never by poking state — so a
 * step whose goal is unreachable (target out of range, panel gated shut, spell
 * not owned) shows up as a stall instead of shipping broken.
 */

interface Driver {
  g: Game
  t: Tutorial
}

/** Walk the wizard one step along a flow field toward `to`. Returns false if stuck. */
function stepToward(g: Game, to: { x: number; y: number }): boolean {
  const field = g.level.flowField([to], false)
  const p = g.player
  const here = field[p.y * g.level.w + p.x]
  let best: { dx: number; dy: number; d: number } | undefined
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = p.x + dx, ny = p.y + dy
      if (!g.level.passable(nx, ny, false)) continue
      const occ = g.level.unitAt(nx, ny)
      if (occ && occ.team !== 'player') continue
      const d = field[ny * g.level.w + nx]
      if (d >= here) continue
      if (!best || d < best.d) best = { dx, dy, d }
    }
  }
  return best ? g.movePlayer(best.dx, best.dy) : false
}

/** Cast `spellId` at the first target it is legal against, preferring `want`. */
function castAt(g: Game, spellId: string | undefined, want?: { x: number; y: number }): boolean {
  const idx = g.player.spells.findIndex(s => spellId ? s.id === spellId : g.canCast(g.player.spells.indexOf(s)))
  const list = spellId ? [idx] : g.player.spells.map((_, i) => i)
  for (const i of list) {
    if (i < 0 || !g.canCast(i)) continue
    const s = g.player.spells[i]
    const candidates: { x: number; y: number }[] = []
    if (want) candidates.push(want)
    for (const u of g.enemies) candidates.push({ x: u.x, y: u.y })
    // conjurations and self-targets need a tile, not a victim
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        candidates.push({ x: g.player.x + dx, y: g.player.y + dy })
      }
    }
    for (const c of candidates) {
      if (!g.level.inBounds(c.x, c.y)) continue
      if (!validTarget(s, g, c.x, c.y)) continue
      if (g.castSpell(i, c.x, c.y)) return true
    }
  }
  return false
}

/**
 * Do whatever the current step asks. Returns false when it cannot find a legal
 * action, which the caller reports as a stall.
 */
function playStep(d: Driver): boolean {
  const { g, t } = d
  const step = t.current
  if (!step) return false
  const goal = step.goal
  const marks = goal.mark ? t.marks(goal.mark) : []
  const target = marks[0]

  switch (goal.kind) {
    case 'move': {
      if (!target) return g.movePlayer(1, 0) || g.movePlayer(-1, 0)
      if (g.player.x === target.x && g.player.y === target.y) return true
      return stepToward(g, target)
    }
    case 'examine': {
      if (!target) return false
      g.examined(target.x, target.y)
      return true
    }
    case 'cast': {
      // A `mark` on a cast goal is the required *tile*: either the victim standing
      // on it, or an empty tile for a conjuration. So aim at the mark itself, not
      // at whatever enemy happens to be nearest.
      // Legality is asked of the game (`validTarget`), never recomputed here —
      // range is euclidean, so a hand-rolled chebyshev check silently disagrees.
      const focus = target ?? (g.enemies[0] ? { x: g.enemies[0].x, y: g.enemies[0].y } : undefined)
      if (focus) {
        const required = goal.ref ? g.player.spells.find(s => s.id === goal.ref) : undefined
        const usable = required ? [required] : g.player.spells
        if (!usable.some(s => validTarget(s, g, focus.x, focus.y)) && stepToward(g, focus)) return true
      }
      return castAt(g, goal.ref, focus)
    }
    case 'wait': return g.passTurn()
    case 'panel': {
      const mode = goal.ref as Parameters<Game['canOpenPanel']>[0]
      if (!g.canOpenPanel(mode)) return false
      g.mode = mode
      return true
    }
    case 'learn': {
      if (!g.canOpenPanel('charsheet')) return false
      g.mode = 'charsheet'
      return goal.ref ? g.learnSpell(goal.ref) : false
    }
    case 'upgrade': {
      if (!g.canOpenPanel('charsheet')) return false
      g.mode = 'charsheet'
      const s = g.player.spells.find(sp => sp.id === goal.ref)
      if (!s) return false
      for (const up of s.def.upgrades) {
        if (g.buyUpgrade(s.id, up.id)) return true
      }
      return false
    }
    case 'craft': {
      if (!g.canOpenPanel('craft')) return false
      g.mode = 'craft'
      return goal.ref ? g.craft(goal.ref) : false
    }
    case 'consumable': {
      if (!g.canOpenPanel('inventory')) return false
      g.mode = 'inventory'
      return goal.ref ? g.useConsumable(goal.ref, g.player.x, g.player.y) : false
    }
    case 'portal': {
      const p = g.level.portals[0]
      if (!p) return false
      if (g.player.x !== p.x || g.player.y !== p.y) return stepToward(g, p)
      return g.tryTakePortal()
    }
    default: return false
  }
}

function playTutorial(maxActions = 4000): { d: Driver; actions: number; stalledAt?: string } {
  const g = new Game('tutorial-test')
  g.fx.enabled = false
  startTutorial(g)
  const t = g.tutorial
  if (!t) throw new Error('startTutorial did not install a tutorial')
  const d: Driver = { g, t }

  let actions = 0
  let idle = 0
  let lastStep = -1
  while (!t.done && actions < maxActions) {
    if (t.step !== lastStep) { lastStep = t.step; idle = 0 }
    const before = t.step
    const ok = playStep(d)
    actions++
    if (!ok) idle++
    else if (t.step === before) idle++
    else idle = 0
    // Some steps legitimately need several actions (kill three slimelets); a
    // step that cannot advance in 120 tries is broken.
    if (idle > 120) {
      const s = t.current
      const p = g.player
      const enemies = g.enemies.map(u =>
        `${u.name}@${u.x},${u.y} hp${u.hp} still=${u.stationary} d=${cheb(p.x, p.y, u.x, u.y)} los=${g.level.hasLOS(p.x, p.y, u.x, u.y)}`).join(' | ')
      const mark = s?.goal.mark ? t.marks(s.goal.mark)[0] : undefined
      const field = mark ? g.level.flowField([mark], false) : undefined
      const here = field ? field[p.y * g.level.w + p.x] : -1
      const charges = g.player.spells.map(sp => `${sp.id}:${sp.charges}r${sp.range}`).join(' ')
      return {
        d, actions,
        stalledAt: `step ${t.step + 1}/${TUTORIAL_STEP_COUNT} 「${s?.title}」 goal=${s?.goal.kind}:${s?.goal.ref ?? '-'}/${s?.goal.mark ?? '-'}\n`
          + `  wizard=${p.x},${p.y} hp=${p.hp} mark=${mark ? `${mark.x},${mark.y}` : '-'} flowHere=${here}\n`
          + `  enemies: ${enemies || '(none)'}\n`
          + `  charges: ${charges}`,
      }
    }
  }
  return { d, actions }
}

describe('tutorial script', () => {
  const run = playTutorial()

  it('runs start to finish without stalling', () => {
    if (run.stalledAt) console.log(`TUTORIAL STALL: ${run.stalledAt}`)
    expect(run.stalledAt).toBeUndefined()
    expect(run.d.t.done).toBe(true)
    expect(run.d.g.mode).toBe('tutorialEnd')
  })

  it('covers both hand-built stages', () => {
    expect(run.d.t.stage).toBe(1)
  })

  it('teaches enough steps to be a real tutorial', () => {
    expect(TUTORIAL_STEP_COUNT).toBeGreaterThanOrEqual(20)
  })

  it('leaves the wizard with the kit the script promised', () => {
    const { g } = run.d
    const ids = g.player.spells.map(s => s.id)
    for (const id of ['magic_missile', 'fireball', 'icicle', 'wolf', 'poison_sting']) {
      expect(ids, `missing ${id}`).toContain(id)
    }
    expect(g.player.spells.some(s => s.upgradesTaken.length > 0)).toBe(true)
    expect(Object.values(g.run.equipment).some(a => a?.id === 'rime_band')).toBe(true)
    expect(getArtifact('rime_band')).toBeDefined()
  })

  it('never lets the wizard die mid-lesson', () => {
    expect(run.d.g.player.alive).toBe(true)
  })

  it('refuses actions the current step did not ask for', () => {
    const g = new Game('tutorial-gate')
    g.fx.enabled = false
    startTutorial(g)
    const t = g.tutorial
    if (!t) throw new Error('no tutorial')
    // step 1 is "walk to the mark": casting and waiting are refused, moving is not
    expect(t.current?.goal.kind).toBe('move')
    expect(g.passTurn()).toBe(false)
    expect(castAt(g, 'fireball')).toBe(false)
    expect(g.canOpenPanel('craft')).toBe(false)
    // escape hatches always work, or the player gets locked in a panel
    expect(g.canOpenPanel('play')).toBe(true)
    expect(g.canOpenPanel('menu')).toBe(true)
    expect(g.canOpenPanel('help')).toBe(true)
  })
})
