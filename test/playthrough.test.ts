import { describe, expect, it } from 'vitest'
import { Game } from '../src/core/game'
import { getArtifacts, getSpellDefs } from '../src/core/registry'
import { canCraft, craftArtifact } from '../src/core/crafting'
import { primaryDamageType, validTarget } from '../src/core/spell'
import type { SpellDef } from '../src/core/spell'
import { cheb } from '../src/core/geom'

interface Outcome {
  result: 'win' | 'dead' | 'stuck'
  realm: number
  turns: number
  kills: number
  spells: number
  artifacts: number
  hp: number
}

/**
 * A hand-picked build in the spirit of the game's own advice: reliable
 * no-resistance damage, area clear, a blink, bodies to soak melee, healing,
 * then heavy late-game nukes once the skill point income allows them.
 */
const CHAMPION_BUILD = [
  'magic_missile', 'fireball', 'blink', 'wolf', 'lightning_bolt', 'icicle',
  'healing_light', 'giant_bear', 'iceball', 'chain_lightning', 'touch_of_death',
  'mystic_power', 'fire_drake', 'annihilate', 'void_beam', 'wheel_of_death',
  'flame_burst', 'mega_annihilate', 'lightning_storm', 'blizzard',
  'searing_orb', 'word_of_ice', 'rain_of_fire',
]
function shop(g: Game, preset?: readonly string[]): void {
  const known = new Set(g.player.spells.map(s => s.id))
  const ownedTags = new Set(g.player.spells.flatMap(s => s.def.tags))
  const pool = getSpellDefs().filter(d => !known.has(d.id) && d.level <= g.run.sp)

  if (preset) {
    const next = preset.find(id => !known.has(id) && pool.some(d => d.id === id))
    if (next) { g.learnSpell(next); return }
  }

  // Value per skill point: one 5-point nuke with three charges is the classic
  // beginner mistake, so weigh damage against cost and sustain.
  const score = (d: SpellDef): number => {
    const area = 1 + (d.stats.radius ?? 0) * 0.6
    const power = (d.stats.damage ?? 0) * area
    const sustain = Math.min(d.charges, 14) * 0.6
    let s = (power / Math.max(1, d.level)) * 1.8 + sustain + power * 0.25
    if (d.tags.includes('translocation')) s += 10
    if (d.tags.includes('conjuration')) s += 6
    if (d.tags.some(t => !ownedTags.has(t))) s += 6
    if (d.target === 'self' && !(d.stats.damage ?? 0)) s -= 4
    return s
  }

  const best = pool.length
    ? pool.reduce((a, b) => score(a) >= score(b) ? a : b)
    : undefined

  // "Get a translocation spell before realm 3" is the game's own advice.
  const hasEscape = g.player.spells.some(s => s.def.tags.includes('translocation'))
  if (!hasEscape && g.player.spells.length >= 2) {
    const escapes = pool.filter(d => d.tags.includes('translocation'))
    if (escapes.length) {
      const cheapest = escapes.reduce((a, b) => a.level <= b.level ? a : b)
      g.learnSpell(cheapest.id)
      return
    }
  }

  // a real spellbook keeps growing; 14 entries is the sidebar's practical limit
  if (best && g.player.spells.length < 14) { g.learnSpell(best.id); return }

  // then deepen what we have: damage upgrades first
  for (const s of g.player.spells) {
    if (s.upgradePicksLeft <= 0) continue
    const affordable = s.def.upgrades.filter(u => !s.hasUpgrade(u.id) && (u.cost ?? s.def.level) <= g.run.sp)
    if (!affordable.length) continue
    const up = affordable.reduce((a, b) => (a.mods?.damage ?? 0) >= (b.mods?.damage ?? 0) ? a : b)
    g.buyUpgrade(s.id, up.id)
    return
  }

  if (best) g.learnSpell(best.id)
}

function craft(g: Game): void {
  const worn = new Set(Object.values(g.run.equipment).filter(Boolean).map(a => a?.id))
  const options = getArtifacts()
    .filter(a => !worn.has(a.id) && canCraft(g.run.components, a))
    .sort((a, b) => b.tier - a.tier)
  if (options.length) craftArtifact(g, options[0])
}

function stepTowardsFlow(g: Game, targets: { x: number; y: number }[]): boolean {
  const field = g.level.flowField(targets, false)
  const here = field[g.player.y * g.level.w + g.player.x]
  let best: { dx: number; dy: number; d: number } | undefined
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = g.player.x + dx, ny = g.player.y + dy
      if (!g.level.passable(nx, ny, false)) continue
      // the wizard swaps places with its own minions, so they are not obstacles
      const occupant = g.level.unitAt(nx, ny)
      if (occupant && occupant.team !== 'player') continue
      const d = field[ny * g.level.w + nx]
      if (d >= here) continue
      if (!best || d < best.d) best = { dx, dy, d }
    }
  }
  if (!best) return false
  return g.movePlayer(best.dx, best.dy)
}

function autoPlay(seed: string, maxSteps = 20000, bonusSpPerRealm = 0, preset?: readonly string[]): Outcome {
  const g = new Game(seed)
  g.newRun(seed)
  g.fx.enabled = false

  /**
   * A stall means the realm cannot be finished, which is always an engine or
   * generation defect. Dump the evidence so the cause is visible immediately
   * instead of hiding behind a bare assertion failure.
   */
  const explainStall = (): void => {
    const reach = g.level.flowField([{ x: g.player.x, y: g.player.y }], false)
    const rows = g.enemies.slice(0, 8).map(e => {
      const adj: number[] = []
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) adj.push(reach[(e.y + dy) * g.level.w + e.x + dx] ?? 32752)
      return `${e.name}@${e.x},${e.y} hp${e.hp}/${e.maxHP} fly=${e.flying} stationary=${e.stationary} `
        + `reach=${reach[e.y * g.level.w + e.x]} minAdj=${Math.min(...adj)} `
        + `dist=${cheb(g.player.x, g.player.y, e.x, e.y)} los=${g.level.hasLOS(g.player.x, g.player.y, e.x, e.y)}`
    })
    // why can the wizard not close the distance?
    const field = g.level.flowField(g.enemies.map(e => ({ x: e.x, y: e.y })), false)
    const here = field[g.player.y * g.level.w + g.player.x]
    const steps: string[] = []
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = g.player.x + dx, ny = g.player.y + dy
        const occ = g.level.unitAt(nx, ny)
        steps.push(`${dx},${dy}:t${g.level.get(nx, ny)}f${field[ny * g.level.w + nx]}${occ ? `/${occ.name}` : ''}`)
      }
    }
    console.log(`STALL realm ${g.run.realmIndex} at ${g.player.x},${g.player.y}: ${g.enemies.length} enemies, here=${here}\n  `
      + rows.join('\n  ')
      + `\n  steps: ${steps.join(' ')}`
      + `\n  trail: ${trail.join(' ')}`
      + `\n  charges: ${g.player.spells.map(s => `${s.id}:${s.charges}r${s.range}`).join(' ')}`)
  }

  const snapshot = (result: Outcome['result']): Outcome => {
    if (result === 'stuck') explainStall()
    return {
      result, realm: g.run.realmIndex, turns: g.stats.turns, kills: g.stats.killCount,
      spells: g.player.spells.length,
      artifacts: Object.values(g.run.equipment).filter(Boolean).length,
      hp: g.player.hp,
    }
  }

  let lastTurn = -1
  let idleSteps = 0
  let lastRealm = g.run.realmIndex
  let realmTurns = 0
  const trail: string[] = []
  const mark = (what: string): void => { trail.push(what); if (trail.length > 24) trail.shift() }

  for (let step = 0; step < maxSteps; step++) {
    if (g.mode === 'dead' || g.mode === 'win') break
    g.fx.list.length = 0

    // a step that fails to advance the clock is a bug, not a strategy
    if (g.stats.turns === lastTurn) {
      idleSteps++
      if (idleSteps > 40) return snapshot('stuck')
    } else {
      lastTurn = g.stats.turns
      idleSteps = 0
    }

    if (g.run.realmIndex !== lastRealm) {
      lastRealm = g.run.realmIndex
      realmTurns = 0
      g.run.sp += bonusSpPerRealm
    }
    realmTurns++
    // A realm that cannot be finished in 600 turns is a generation bug
    // (unreachable monsters, sealed portals), not a hard fight.
    if (realmTurns > 600) return snapshot('stuck')

    if (g.run.sp > 0) shop(g, preset)
    craft(g)

    if (g.player.hp < g.player.effectiveMaxHP * 0.4) {
      const potion = g.run.inventory.find(e => e.id === 'greater_healing_potion' || e.id === 'healing_potion')
      if (potion && g.useConsumable(potion.id, g.player.x, g.player.y)) { mark('potion'); continue }
    }

    const enemies = g.enemies
    if (!enemies.length) {
      const portals = g.level.portals
      if (g.level.portalAt(g.player.x, g.player.y) && g.tryTakePortal()) continue
      if (portals.length && stepTowardsFlow(g, portals.map(p => ({ x: p.x, y: p.y })))) continue
      g.passTurn()
      continue
    }

    // How boxed in are we? Melee pressure is what actually kills wizards.
    const nearest = enemies.reduce((a, b) =>
      cheb(g.player.x, g.player.y, a.x, a.y) <= cheb(g.player.x, g.player.y, b.x, b.y) ? a : b)
    const threatRange = cheb(g.player.x, g.player.y, nearest.x, nearest.y)
    const adjacent = enemies.filter(e => cheb(g.player.x, g.player.y, e.x, e.y) <= 1).length
    const hurt = g.player.hp < g.player.effectiveMaxHP * 0.55
    const minions = g.level.units.filter(u => u.alive && u.team === 'player' && !u.isPlayer).length

    // 1. Escape a melee pile with translocation.
    if (adjacent >= 2 || (hurt && threatRange <= 1)) {
      let escape: { idx: number; x: number; y: number; gain: number } | undefined
      g.player.spells.forEach((s, idx) => {
        if (!g.canCast(idx) || !s.def.tags.includes('translocation')) return
        for (let y = 0; y < g.level.h; y++) {
          for (let x = 0; x < g.level.w; x++) {
            if (!validTarget(s, g, x, y)) continue
            const gain = enemies.reduce((m, e) => Math.min(m, cheb(x, y, e.x, e.y)), 99)
            if (gain <= Math.max(threatRange, 3)) continue
            if (!escape || gain > escape.gain) escape = { idx, x, y, gain }
          }
        }
      })
      if (escape && g.castSpell(escape.idx, escape.x, escape.y)) { mark('escape'); continue }
    }

    // 2. Summons are the wizard's front line — put a body between us and them.
    if (minions === 0 && threatRange <= 6) {
      let summon: { idx: number; x: number; y: number } | undefined
      g.player.spells.forEach((s, idx) => {
        if (summon || !g.canCast(idx) || !s.def.tags.includes('conjuration')) return
        if (s.def.target === 'self') { summon = { idx, x: g.player.x, y: g.player.y }; return }
        const dx = Math.sign(nearest.x - g.player.x), dy = Math.sign(nearest.y - g.player.y)
        for (const step of [1, 2]) {
          const x = g.player.x + dx * step, y = g.player.y + dy * step
          if (validTarget(s, g, x, y)) { summon = { idx, x, y }; return }
        }
        for (let r = 1; r <= 2 && !summon; r++) {
          for (let ddy = -r; ddy <= r && !summon; ddy++) {
            for (let ddx = -r; ddx <= r && !summon; ddx++) {
              const x = g.player.x + ddx, y = g.player.y + ddy
              if (validTarget(s, g, x, y)) summon = { idx, x, y }
            }
          }
        }
      })
      if (summon && g.castSpell(summon.idx, summon.x, summon.y)) { mark('summon'); continue }
    }

    // 3. Score every legal (spell, target) pair. Resistances matter: hammering a
    // fire-resistant slime with Fireball is how naive play stalls out.
    let choice: { idx: number; x: number; y: number; score: number } | undefined
    g.player.spells.forEach((s, idx) => {
      if (!g.canCast(idx)) return
      const dmg = s.st('damage')
      const school = primaryDamageType(s.def)
      // Realm-wide effects (storms, words) target the wizard itself and hit
      // everything on the level, so they must be valued against the whole board.
      const realmWide = s.def.target === 'self' && !s.def.requiresLOS && s.radius === 0
      const consider = (x: number, y: number) => {
        if (!validTarget(s, g, x, y)) return
        const hits = realmWide
          ? enemies
          : s.radius > 0
            ? enemies.filter(e => Math.hypot(e.x - x, e.y - y) <= s.radius + 0.001)
            : (() => { const u = g.level.unitAt(x, y); return u && u.team === 'enemy' ? [u] : [] })()
        let value = 0
        if (dmg > 0 && school) {
          for (const e of hits) value += Math.max(0, dmg * (100 - e.resistOf(school)) / 100)
        } else {
          value = hits.length ? hits.length * 5 : 4
        }
        if (value <= 0) return
        // focus the boss: killing the escort first just feeds its summons
        if (hits.some(e => e.level >= 9)) value *= 1.6
        const selfHarm = !realmWide && s.radius > 0 && Math.hypot(g.player.x - x, g.player.y - y) <= s.radius ? 10 : 0
        const score = value - selfHarm - cheb(g.player.x, g.player.y, x, y) * 0.1
        if (!choice || score > choice.score) choice = { idx, x, y, score }
      }
      for (const e of enemies) consider(e.x, e.y)
      if (s.def.target === 'self') consider(g.player.x, g.player.y)
    })

    // 4. Retreating only pays when it actually reduces how many things can hit
    // us: monsters move at our speed, so backing off a single chaser is a wasted
    // turn. Disengage when surrounded, otherwise trade damage.
    const killsThreat = choice ? choice.score >= nearest.hp : false
    if (choice && (adjacent >= 3 || (hurt && adjacent >= 2 && !killsThreat))) {
      let retreat: { dx: number; dy: number; gain: number } | undefined
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const nx = g.player.x + dx, ny = g.player.y + dy
          if (!g.level.vacant(nx, ny, false)) continue
          const gain = enemies.reduce((m, e) => Math.min(m, cheb(nx, ny, e.x, e.y)), 99)
          if (gain <= threatRange) continue
          if (!retreat || gain > retreat.gain) retreat = { dx, dy, gain }
        }
      }
      if (retreat && g.movePlayer(retreat.dx, retreat.dy)) { mark('retreat'); continue }
    }

    if (choice && g.castSpell(choice.idx, choice.x, choice.y)) { mark('cast'); continue }

    const anyCharges = g.player.spells.some(s => s.charges > 0)
    if (!anyCharges && g.run.inventory.some(e => e.id === 'mana_potion')
      && g.useConsumable('mana_potion', g.player.x, g.player.y)) { mark('mana'); continue }

    // 5. Out of spells: throw a bomb, otherwise reposition.
    const bomb = g.run.inventory.find(e => e.id === 'fire_bomb' || e.id === 'frost_bomb' || e.id === 'scroll_of_thunder')
    if (bomb && g.useConsumable(bomb.id, nearest.x, nearest.y)) { mark('bomb'); continue }

    // Backing off only pays against something we can see and shoot. With no line
    // of sight the answer is to close in, not to retreat.
    if (threatRange <= 2 && g.level.hasLOS(g.player.x, g.player.y, nearest.x, nearest.y)) {
      const away = { dx: -Math.sign(nearest.x - g.player.x), dy: -Math.sign(nearest.y - g.player.y) }
      if (g.movePlayer(away.dx, away.dy)) { mark('away'); continue }
    }
    if (stepTowardsFlow(g, enemies.map(e => ({ x: e.x, y: e.y })))) { mark('close'); continue }
    mark('wait')
    g.passTurn()
  }

  return snapshot(g.mode === 'win' ? 'win' : g.mode === 'dead' ? 'dead' : 'stuck')
}

describe('full run playthrough', () => {
  it('a scripted wizard can fight through the rifts', () => {
    const seeds = ['alpha', 'beta', 'gamma', 'delta', 'epsilon']
    const results = seeds.map(s => ({ seed: s, ...autoPlay(s) }))
    for (const r of results) {
      console.log(`seed ${r.seed}: ${r.result} at realm ${r.realm} — ${r.turns} turns, ${r.kills} kills, ${r.spells} spells, ${r.artifacts} artifacts`)
    }

    // no run may hang: every one ends in victory or death
    expect(results.filter(r => r.result === 'stuck')).toEqual([])
    // the bot plays badly, but the game must be beatable enough to reach realm 4+
    expect(Math.max(...results.map(r => r.realm))).toBeGreaterThanOrEqual(4)
  }, 240_000)

  it('the twenty-realm ladder and the Mordred kill are reachable', () => {
    // The naive bot above measures difficulty. This one measures *reachability*:
    // a scripted wizard with a hand-built spell list and a generous skill point
    // income must be able to walk the entire ladder, beat all four bosses and
    // trigger the victory state. It plays far worse than a human but buys far
    // more, which isolates "is the run completable" from "is the bot smart".
    const seeds = ['champion', 'paragon', 'archmage', 'sage', 'oracle', 'warden']
    const results = seeds.map(s => ({ seed: s, ...autoPlay(s, 60000, 9, CHAMPION_BUILD) }))
    for (const r of results) {
      console.log(`${r.seed}: ${r.result} at realm ${r.realm} — ${r.turns} turns, ${r.kills} kills, `
        + `${r.spells} spells, ${r.artifacts} artifacts, ${r.hp} hp left`)
    }
    expect(results.filter(r => r.result === 'stuck')).toEqual([])
    expect(results.some(r => r.result === 'win' && r.realm === 20)).toBe(true)
  }, 900_000)

  it('entering a realm refills charges and grants SP', () => {
    const g = new Game('refill')
    g.newRun('refill')
    g.fx.enabled = false
    g.learnSpell(getSpellDefs().find(s => s.level === 1)?.id ?? 'fireball')
    const spell = g.player.spells[0]
    expect(spell).toBeTruthy()
    spell.charges = 0
    for (const e of g.enemies.slice()) e.hp = 0
    // clear the level by force
    for (const e of g.enemies.slice()) g.level.removeUnit(e)
    expect(g.cleared).toBe(true)
    const spBefore = g.run.sp
    const portal = g.level.portals[0]
    expect(portal).toBeTruthy()
    g.level.placeUnit(g.player, portal.x, portal.y)
    expect(g.tryTakePortal()).toBe(true)
    expect(g.run.realmIndex).toBe(2)
    expect(g.run.sp).toBeGreaterThan(spBefore)
    expect(g.player.spells[0].charges).toBe(g.player.spells[0].maxCharges)
  })
})
