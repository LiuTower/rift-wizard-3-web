import { Tile, type DamageType } from './types'
import type { Unit, Buff } from './unit'
import type { Game } from './game'
import type { SpellInst } from './spell'
import { DIRS8, cheb, line } from './geom'

export interface DamageEvent {
  target: Unit
  source?: Unit
  amount: number
  type: DamageType
  spell?: SpellInst
  /** true once shields or immunity ate the hit */
  blocked: boolean
  /** raw amount before resistances, for triggers that care */
  raw: number
}

/**
 * The single damage path. Everything (spells, monsters, clouds, poison ticks)
 * routes through here so triggers, resistances and shields stay consistent.
 * Returns the HP actually removed.
 */
export function dealDamage(
  g: Game, target: Unit, amount: number, type: DamageType,
  source?: Unit, spell?: SpellInst,
): number {
  if (!target.alive) return 0
  const ev: DamageEvent = { target, source, amount: Math.max(0, Math.floor(amount)), type, spell, blocked: false, raw: amount }

  if (source?.alive) {
    for (const b of source.buffs.slice()) b.modifyOutgoing?.(source, g, ev)
  }

  const resist = target.resistOf(type)
  if (resist !== 0) ev.amount = Math.floor(ev.amount * (100 - resist) / 100)
  if (ev.amount < 0) ev.amount = 0

  for (const b of target.buffs.slice()) b.modifyIncoming?.(target, g, ev)

  if (ev.amount <= 0) {
    g.fx.float(target.x, target.y, resist >= 100 ? '免疫' : '0', '#8890a0')
    return 0
  }

  if (target.shields > 0) {
    target.shields--
    ev.blocked = true
    g.fx.float(target.x, target.y, '格挡', '#c8d8ff')
    g.fx.flash(target.x, target.y, '#c8d8ff')
    return 0
  }

  const dealt = Math.min(ev.amount, target.hp)
  target.hp -= ev.amount
  g.fx.damage(target.x, target.y, ev.amount, type)
  const label = spell?.def.name ?? source?.name ?? '裂隙'
  g.recordDamage(label, dealt, !!spell || source?.team === 'player')

  for (const b of target.buffs.slice()) b.onHurt?.(target, g, ev)
  g.emit('damage', ev)

  if (target.hp <= 0) killUnit(g, target, source)
  return dealt
}

export function healUnit(g: Game, target: Unit, amount: number): number {
  if (!target.alive) return 0
  const max = target.effectiveMaxHP
  const healed = Math.min(Math.floor(amount), max - target.hp)
  if (healed <= 0) return 0
  target.hp += healed
  g.fx.float(target.x, target.y, `+${healed}`, '#66ff88')
  return healed
}

export function killUnit(g: Game, target: Unit, killer?: Unit): void {
  if (target.dead) return
  target.dead = true
  target.hp = 0

  for (const b of target.buffs.slice()) b.onDeath?.(target, g)
  if (killer?.alive) for (const b of killer.buffs.slice()) b.onKill?.(killer, g, target)

  g.fx.death(target.x, target.y, target.color)
  g.emit('death', { unit: target, killer })

  if (target.isPlayer) {
    g.log(`${target.name} 被击杀了！`, '#ff4040')
    g.onPlayerDeath()
    return
  }

  if (target.team === 'enemy') {
    g.recordKill(target.name)
    g.rollDrop(target)
  }

  const spawn = target.def?.deathSpawn
  g.level.removeUnit(target)
  if (spawn) {
    for (let i = 0; i < spawn.count; i++) {
      summonUnit(g, spawn.id, target.x, target.y, { team: target.team, quiet: true })
    }
  }
}

/** Apply a buff, honouring its stacking rule. */
export function applyBuff(g: Game, target: Unit, buff: Buff): Buff | undefined {
  if (!target.alive) return undefined
  const existing = target.buffOf(buff.id)
  if (existing) {
    const mode = buff.stacking ?? 'refresh'
    if (mode === 'ignore') return existing
    if (mode === 'stack') {
      existing.stacks = (existing.stacks ?? 1) + (buff.stacks ?? 1)
      existing.duration = Math.max(existing.duration, buff.duration)
      return existing
    }
    existing.duration = Math.max(existing.duration, buff.duration)
    return existing
  }
  target.buffs.push(buff)
  buff.onApply?.(target, g)
  if (buff.maxHPBonus && target.hp > 0) target.hp += buff.maxHPBonus
  return buff
}

export function removeBuff(g: Game, target: Unit, id: string): void {
  const i = target.buffs.findIndex(b => b.id === id)
  if (i < 0) return
  const b = target.buffs[i]
  target.buffs.splice(i, 1)
  if (b.maxHPBonus) target.hp = Math.max(1, target.hp - b.maxHPBonus)
  b.onExpire?.(target, g)
}

/** Strip all debuffs (Purity, cleansing effects). */
export function cleanse(g: Game, target: Unit): number {
  const debuffs = target.buffs.filter(b => b.kind === 'debuff')
  for (const b of debuffs) removeBuff(g, target, b.id)
  return debuffs.length
}

export interface SummonOpts {
  team?: 'player' | 'enemy'
  duration?: number
  summoner?: Unit
  quiet?: boolean
  /** apply the wizard's minion bonuses */
  applyMinionBonus?: boolean
  hpBonus?: number
  damageBonus?: number
}

/** Find a free tile near (x,y), spiralling outward. */
export function findFreeTile(g: Game, x: number, y: number, flying = false, maxR = 6): { x: number; y: number } | undefined {
  if (g.level.vacant(x, y, flying)) return { x, y }
  for (let r = 1; r <= maxR; r++) {
    const ring: { x: number; y: number }[] = []
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        ring.push({ x: x + dx, y: y + dy })
      }
    }
    g.rng.shuffle(ring)
    for (const p of ring) if (g.level.vacant(p.x, p.y, flying)) return p
  }
  return undefined
}

export function summonUnit(g: Game, defId: string, x: number, y: number, opts: SummonOpts = {}): Unit | undefined {
  const unit = g.makeUnit(defId)
  if (!unit) return undefined
  unit.team = opts.team ?? 'player'
  const spot = findFreeTile(g, x, y, unit.flying)
  if (!spot) return undefined
  if (opts.duration !== undefined && opts.duration > 0) unit.summonTurns = opts.duration
  unit.summoner = opts.summoner
  if (opts.applyMinionBonus !== false && unit.team === 'player') {
    const hpBonus = (opts.hpBonus ?? 0) + g.player.minionBonus('minion_health')
    const dmgBonus = (opts.damageBonus ?? 0) + g.player.minionBonus('minion_damage')
    if (hpBonus) { unit.maxHP += hpBonus; unit.hp += hpBonus }
    if (dmgBonus) for (const a of unit.attacks) if (a.damage) a.damage += dmgBonus
  }
  unit.x = spot.x; unit.y = spot.y
  g.level.addUnit(unit)
  g.applyPassives(unit)
  g.fx.spawn(spot.x, spot.y, unit.color)
  if (!opts.quiet) g.log(`${unit.name} 出现了。`, unit.team === 'player' ? '#9affc0' : '#ff9a9a')
  return unit
}

export function teleportUnit(g: Game, u: Unit, x: number, y: number): boolean {
  if (!g.level.vacant(x, y, u.flying)) {
    const spot = findFreeTile(g, x, y, u.flying, 3)
    if (!spot) return false
    x = spot.x; y = spot.y
  }
  const fx = u.x, fy = u.y
  g.fx.teleport(fx, fy, x, y, u.color)
  g.level.placeUnit(u, x, y)
  for (const b of u.buffs.slice()) b.onMove?.(u, g, fx, fy)
  if (u.isPlayer) g.level.invalidateLOS()
  g.checkTileEffects(u)
  return true
}

/** Shove a unit `distance` tiles directly away from (fromX,fromY). */
export function pushUnit(g: Game, u: Unit, fromX: number, fromY: number, distance: number): void {
  const dx = Math.sign(u.x - fromX) || (g.rng.chance(0.5) ? 1 : -1)
  const dy = Math.sign(u.y - fromY)
  let cx = u.x, cy = u.y
  for (let i = 0; i < distance; i++) {
    const nx = cx + dx, ny = cy + dy
    if (!g.level.vacant(nx, ny, u.flying)) break
    cx = nx; cy = ny
  }
  if (cx !== u.x || cy !== u.y) {
    g.level.placeUnit(u, cx, cy)
    g.checkTileEffects(u)
  }
}

/** Drag a unit `distance` tiles toward (toX,toY). */
export function pullUnit(g: Game, u: Unit, toX: number, toY: number, distance: number): void {
  const path = line(u.x, u.y, toX, toY)
  let last = { x: u.x, y: u.y }
  for (let i = 1; i < path.length && i <= distance; i++) {
    const p = path[i]
    if (!g.level.vacant(p.x, p.y, u.flying)) break
    last = p
  }
  if (last.x !== u.x || last.y !== u.y) {
    g.level.placeUnit(u, last.x, last.y)
    g.checkTileEffects(u)
  }
}

/** Units of the given hostility relative to `u`, optionally within radius. */
export function unitsNear(g: Game, x: number, y: number, radius: number, filter?: (u: Unit) => boolean): Unit[] {
  const out: Unit[] = []
  for (const u of g.level.units) {
    if (!u.alive) continue
    if (cheb(x, y, u.x, u.y) > radius) continue
    if (Math.hypot(u.x - x, u.y - y) > radius + 0.001) continue
    if (filter && !filter(u)) continue
    out.push(u)
  }
  return out
}

/** Destroy a wall tile, if it is one. */
export function digWall(g: Game, x: number, y: number): boolean {
  if (g.level.get(x, y) !== Tile.Wall) return false
  g.level.set(x, y, Tile.Floor)
  g.fx.flash(x, y, '#c8a878')
  return true
}

export function randomAdjacent(g: Game, x: number, y: number, flying = false): { x: number; y: number } | undefined {
  const opts = DIRS8.map(([dx, dy]) => ({ x: x + dx, y: y + dy })).filter(p => g.level.vacant(p.x, p.y, flying))
  return opts.length ? g.rng.pick(opts) : undefined
}
