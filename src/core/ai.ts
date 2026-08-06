import type { Game } from './game'
import type { Attack, Unit } from './unit'
import { DAMAGE_COLORS } from './types'
import { ballPoints, cheb, conePoints, DIRS8 } from './geom'
import { applyBuff, dealDamage, healUnit, pullUnit, pushUnit, summonUnit, teleportUnit, unitsNear } from './combat'
import { makeBuff } from './buffs'
import { spawnCloud } from './clouds'

/** Nearest unit this one wants dead. */
export function pickTarget(g: Game, u: Unit): Unit | undefined {
  let best: Unit | undefined
  let bestD = Infinity
  for (const t of g.level.units) {
    if (!t.alive || t === u) continue
    if (!u.isHostileTo(t)) continue
    const d = cheb(u.x, u.y, t.x, t.y)
    if (d < bestD) { bestD = d; best = t }
  }
  return best
}

function inRange(u: Unit, atk: Attack, tx: number, ty: number): boolean {
  const d = Math.hypot(tx - u.x, ty - u.y)
  const r = atk.range ?? 1
  if (d > r + 0.001) return false
  if (atk.minRange && d < atk.minRange) return false
  return true
}

function canUse(g: Game, u: Unit, atk: Attack, target: Unit | undefined, i: number): boolean {
  if (u.cooldowns[i] > 0) return false
  const needsTarget = atk.kind !== 'summon' && atk.kind !== 'buff_allies' && atk.kind !== 'heal_allies' && atk.kind !== 'burst'
  if (atk.kind === 'summon') {
    if (!target) return false // nothing to fight, no reinforcements needed
    const cap = atk.summonCap ?? 4
    let live = 0
    for (const m of g.level.units) if (m.alive && m.summoner === u) live++
    return live < cap
  }
  if (atk.kind === 'buff_allies' || atk.kind === 'heal_allies') {
    const radius = atk.radius ?? 4
    const allies = unitsNear(g, u.x, u.y, radius, t => t !== u && t.team === u.team && t.alive
      && (atk.kind === 'heal_allies' ? t.hp < t.effectiveMaxHP : !t.hasBuff(atk.buff ?? '')))
    return allies.length > 0
  }
  if (atk.kind === 'burst') {
    if (!target) return false
    return unitsNear(g, u.x, u.y, atk.radius ?? 2, t => t.isHostileTo(u)).length > 0
  }
  if (needsTarget && !target) return false
  if (!target) return false
  if (u.blinded && (atk.range ?? 1) > 1) return false
  if (!inRange(u, atk, target.x, target.y)) return false
  if ((atk.requiresLOS ?? true) && !g.level.hasLOS(u.x, u.y, target.x, target.y)) return false
  return true
}

/** Resolve one declarative attack. Assumes `canUse` already passed. */
export function resolveAttack(g: Game, u: Unit, atk: Attack, tx: number, ty: number): void {
  const type = atk.damageType ?? 'physical'
  const color = atk.color ?? DAMAGE_COLORS[type]
  const dmg = atk.damage ?? 0
  const target = g.level.unitAt(tx, ty)
  u.facing = tx < u.x ? -1 : 1

  const applyOnHit = (victim: Unit) => {
    if (!atk.buff) return
    const b = makeBuff(atk.buff, atk.buffDuration ?? 3, atk.buffPower)
    if (b) applyBuff(g, victim, b)
  }

  switch (atk.kind) {
    case 'melee': {
      g.fx.strike(tx, ty, color)
      if (target) { dealDamage(g, target, dmg, type, u); if (target.alive) applyOnHit(target) }
      break
    }
    case 'bolt': {
      g.fx.bolt(u.x, u.y, tx, ty, color)
      if (target) { dealDamage(g, target, dmg, type, u); if (target.alive) applyOnHit(target) }
      break
    }
    case 'beam': {
      const path = g.level.raycast(u.x, u.y, tx, ty, atk.range ?? 8)
      g.fx.beam(u.x, u.y, path.length ? path[path.length - 1].x : tx, path.length ? path[path.length - 1].y : ty, color, 1)
      for (const p of path) {
        const v = g.level.unitAt(p.x, p.y)
        if (v && v !== u) { dealDamage(g, v, dmg, type, u); if (v.alive) applyOnHit(v) }
      }
      break
    }
    case 'breath': {
      const pts = conePoints(u.x, u.y, tx, ty, atk.range ?? 5, 0.44)
      const hit = pts.filter(p => g.level.hasLOS(u.x, u.y, p.x, p.y))
      g.fx.area(hit, color)
      for (const p of hit) {
        const v = g.level.unitAt(p.x, p.y)
        if (v && v !== u && v.isHostileTo(u)) { dealDamage(g, v, dmg, type, u); if (v.alive) applyOnHit(v) }
      }
      break
    }
    case 'burst':
    case 'blast': {
      const cx = atk.kind === 'burst' ? u.x : tx
      const cy = atk.kind === 'burst' ? u.y : ty
      const pts = ballPoints(cx, cy, atk.radius ?? 2).filter(p => g.level.inBounds(p.x, p.y) && g.level.hasLOS(cx, cy, p.x, p.y))
      g.fx.area(pts, color)
      for (const p of pts) {
        const v = g.level.unitAt(p.x, p.y)
        if (v && v !== u && v.isHostileTo(u)) { dealDamage(g, v, dmg, type, u); if (v.alive) applyOnHit(v) }
      }
      break
    }
    case 'summon': {
      const n = atk.summonCount ?? 1
      for (let i = 0; i < n; i++) {
        if (!atk.summonId) break
        summonUnit(g, atk.summonId, u.x, u.y, { team: u.team, summoner: u, quiet: true, applyMinionBonus: false })
      }
      g.fx.flash(u.x, u.y, color)
      if (g.canSee(u)) g.log(`${u.name} 召来了援军。`, '#ff9a9a')
      break
    }
    case 'buff_allies': {
      const radius = atk.radius ?? 4
      const allies = unitsNear(g, u.x, u.y, radius, t => t.team === u.team && t.alive && t !== u)
      for (const a of allies) {
        const b = atk.buff ? makeBuff(atk.buff, atk.buffDuration ?? 5, atk.buffPower) : undefined
        if (b) applyBuff(g, a, b)
        g.fx.beam(u.x, u.y, a.x, a.y, color, 0.4)
      }
      if (allies.length && g.canSee(u)) g.log(`${u.name} 强化了同伴。`, '#ff9a9a')
      break
    }
    case 'heal_allies': {
      const radius = atk.radius ?? 4
      for (const a of unitsNear(g, u.x, u.y, radius, t => t.team === u.team && t.alive && t.hp < t.effectiveMaxHP)) {
        healUnit(g, a, atk.heal ?? 10)
        g.fx.beam(u.x, u.y, a.x, a.y, '#66ff88', 0.4)
      }
      break
    }
    case 'debuff': {
      if (target) {
        const b = atk.buff ? makeBuff(atk.buff, atk.buffDuration ?? 3, atk.buffPower) : undefined
        if (b) applyBuff(g, target, b)
        g.fx.bolt(u.x, u.y, tx, ty, color)
        if (dmg > 0) dealDamage(g, target, dmg, type, u)
      }
      break
    }
    case 'cloud': {
      const pts = ballPoints(tx, ty, atk.radius ?? 1)
      for (const p of pts) {
        if (!g.level.passable(p.x, p.y, true)) continue
        spawnCloud(g, atk.cloudKind ?? 'fire', p.x, p.y, atk.buffDuration ?? 4, dmg || undefined, u.team)
      }
      g.fx.area(pts, color)
      break
    }
    case 'teleport': {
      const spots = DIRS8.map(([dx, dy]) => ({ x: tx + dx, y: ty + dy })).filter(p => g.level.vacant(p.x, p.y, u.flying))
      if (spots.length) {
        const spot = g.rng.pick(spots)
        teleportUnit(g, u, spot.x, spot.y)
      }
      break
    }
    case 'pull': {
      if (target) { g.fx.beam(u.x, u.y, tx, ty, color, 0.5); pullUnit(g, target, u.x, u.y, atk.radius ?? 3) }
      break
    }
    case 'push': {
      if (target) { g.fx.strike(tx, ty, color); pushUnit(g, target, u.x, u.y, atk.radius ?? 3); if (dmg) dealDamage(g, target, dmg, type, u) }
      break
    }
  }
}

export type TurnAction = 'none' | 'attack' | 'move'

/** One monster turn: charge resolution, attack selection, then movement. */
export function takeMonsterTurn(g: Game, u: Unit): TurnAction {
  if (!u.alive) return 'none'

  for (let i = 0; i < u.cooldowns.length; i++) if (u.cooldowns[i] > 0) u.cooldowns[i]--

  if (u.stunned) return 'none'

  if (u.charging) {
    const { attack, x, y } = u.charging
    u.charging = undefined
    resolveAttack(g, u, attack, x, y)
    return 'attack'
  }

  const target = pickTarget(g, u)

  for (let i = 0; i < u.attacks.length; i++) {
    const atk = u.attacks[i]
    if (!canUse(g, u, atk, target, i)) continue
    const tx = target ? target.x : u.x
    const ty = target ? target.y : u.y
    u.cooldowns[i] = atk.cooldown ?? 0
    if (atk.telegraph) {
      u.charging = { attack: atk, x: tx, y: ty }
      g.fx.charge(u.x, u.y, atk.color ?? DAMAGE_COLORS[atk.damageType ?? 'physical'])
      if (g.canSee(u)) g.log(`${u.name} 开始引导 ${atk.name ?? '某种可怕之物'}。`, '#ffb0b0')
    } else {
      resolveAttack(g, u, atk, tx, ty)
    }
    return 'attack'
  }

  if (u.stationary || u.rooted || !target) return 'none'
  return moveToward(g, u, target) ? 'move' : 'none'
}

/**
 * Step one tile along the flow field toward `target`. Returns true if it moved.
 *
 * When every downhill tile is taken by an ally, the mover swaps with one instead
 * of standing still: a pack wedged in a corridor would otherwise deadlock and
 * the realm could never be cleared.
 */
export function moveToward(g: Game, u: Unit, target: Unit): boolean {
  const field = g.flowTo(target, u.flying)
  const here = field[u.y * g.level.w + u.x]
  let best: { x: number; y: number; score: number } | undefined
  let swap: { unit: Unit; score: number } | undefined
  const dirs = g.rng.shuffle(DIRS8.slice())
  for (const [dx, dy] of dirs) {
    const nx = u.x + dx, ny = u.y + dy
    if (!g.level.passable(nx, ny, u.flying)) continue
    const d = field[ny * g.level.w + nx]
    if (d >= here) continue
    const occupant = g.level.unitAt(nx, ny)
    if (occupant) {
      // Shuffle past allies only. Never displace the wizard: the player would
      // be shoved back and forth by its own minions and never advance.
      if (occupant.team !== u.team || occupant === target || occupant.isPlayer) continue
      if (!g.level.passable(u.x, u.y, occupant.flying)) continue
      if (!swap || d < swap.score) swap = { unit: occupant, score: d }
      continue
    }
    // prefer open lanes: crowded neighbours are a worse step at equal distance
    let crowd = 0
    for (const [ox, oy] of DIRS8) if (g.level.unitAt(nx + ox, ny + oy)) crowd++
    const score = d * 4 + crowd
    if (!best || score < best.score) best = { x: nx, y: ny, score }
  }

  const fx = u.x, fy = u.y
  if (best) {
    u.facing = best.x < u.x ? -1 : 1
    g.level.placeUnit(u, best.x, best.y)
  } else if (swap) {
    const other = swap.unit
    const ox = other.x, oy = other.y
    u.facing = ox < u.x ? -1 : 1
    g.level.placeUnit(other, fx, fy)
    g.level.placeUnit(u, ox, oy)
    g.checkTileEffects(other)
  } else {
    return false
  }

  for (const b of u.buffs.slice()) b.onMove?.(u, g, fx, fy)
  g.checkTileEffects(u)
  return true
}
