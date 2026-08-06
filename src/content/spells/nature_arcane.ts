import type { SpellDef, SpellInst } from '../../core/spell'
import type { Unit, UnitDef } from '../../core/unit'
import type { Game } from '../../core/game'
import type { SpriteDef } from '../../render/sprite'
import { DAMAGE_NAMES, Tile, type DamageType, type Point } from '../../core/types'
import { ballPoints, cheb, ringPoints } from '../../core/geom'
import { applyBuff, dealDamage, digWall, summonUnit, teleportUnit, unitsNear } from '../../core/combat'
import { makeBuff } from '../../core/buffs'
import { spawnCloud } from '../../core/clouds'

// ------------------------------------------------------------------- helpers

const ARCANE = '#ff5cc8'
const MISSILE = '#8ad8ff'
const NATURE = '#5ad04a'
const CHAOS = '#ffb03a'
const MELT = '#ff8f5a'
const EARTH = '#c8a878'
const STONE = '#b0a898'
const MOON = '#c8e8ff'
const MIND = '#b0ffd8'

/** Hostile creatures only: never the wizard, never his minions. */
function isFoe(u: Unit): boolean {
  return u.alive && u.team === 'enemy'
}

function applyStatus(g: Game, u: Unit, id: string, duration: number, power?: number): void {
  if (duration <= 0 || !u.alive) return
  const b = makeBuff(id, duration, power)
  if (b) applyBuff(g, u, b)
}

/** Nearest hostile creature to (x,y) within radius, skipping already-hit units. */
function nearestFoe(g: Game, x: number, y: number, radius: number, skip: Set<number>): Unit | undefined {
  let best: Unit | undefined
  let bestD = Infinity
  for (const u of unitsNear(g, x, y, radius, isFoe)) {
    if (skip.has(u.uid)) continue
    if (!g.level.hasLOS(x, y, u.x, u.y)) continue
    const d = cheb(x, y, u.x, u.y)
    if (d < bestD) { bestD = d; best = u }
  }
  return best
}

const TRIPLE: DamageType[] = ['fire', 'lightning', 'physical']
const QUINT: DamageType[] = ['fire', 'lightning', 'physical', 'ice', 'dark']

/**
 * The Annihilate family: the damage cut into three whole shares, one per type,
 * dealt as separate hits so no single resistance stops all of it. Quintessence
 * adds two more hits at the largest share.
 */
function annihilateShares(s: SpellInst): number[] {
  const total = Math.max(0, s.st('damage'))
  const base = Math.floor(total / 3)
  const rem = total - base * 3
  const a = base + (rem > 0 ? 1 : 0)
  const b = base + (rem > 1 ? 1 : 0)
  return s.has('quintessence') ? [a, b, base, a, a] : [a, b, base]
}

function annihilateHits(s: SpellInst, g: Game, target: Unit): void {
  const shares = annihilateShares(s)
  const types = s.has('quintessence') ? QUINT : TRIPLE
  for (let i = 0; i < shares.length; i++) {
    if (!target.alive) break
    dealDamage(g, target, shares[i], types[i], g.player, s)
  }
}

function annihilateDesc(s: SpellInst): string {
  const types = s.has('quintessence') ? QUINT : TRIPLE
  const words = annihilateShares(s).map((n, i) => `${n} 点${DAMAGE_NAMES[types[i]]}`)
  return `分次独立造成 ${words.join('、')}伤害，单一抗性挡不住全部。`
}

// -------------------------------------------------------------------- spells

const magicMissile: SpellDef = {
  id: 'magic_missile', name: '魔法飞弹', level: 1, charges: 25,
  tags: ['sorcery', 'arcane'], icon: 'icon_magic_missile', color: MISSILE,
  target: 'enemy',
  stats: { damage: 7, range: 9 },
  desc: s => `对单个生物造成 ${s.st('damage')} 点奥术伤害，绝不落空。`
    + (s.has('pierce') ? '飞弹会继续贯穿其身后的一切。' : ''),
  cast(s, g, x, y) {
    const target = g.level.unitAt(x, y)
    if (!target) return
    const dmg = s.st('damage')
    g.fx.bolt(g.player.x, g.player.y, x, y, MISSILE)
    dealDamage(g, target, dmg, 'arcane', g.player, s)
    if (!s.has('pierce')) return
    const dx = x - g.player.x, dy = y - g.player.y
    const steps = Math.max(Math.abs(dx), Math.abs(dy)) || 1
    const range = s.range
    const ex = x + Math.round((dx / steps) * range)
    const ey = y + Math.round((dy / steps) * range)
    const path = g.level.raycast(x, y, ex, ey, range)
    if (path.length) g.fx.bolt(x, y, path[path.length - 1].x, path[path.length - 1].y, MISSILE)
    for (const p of path) {
      const u = g.level.unitAt(p.x, p.y)
      if (u && isFoe(u)) dealDamage(g, u, dmg, 'arcane', g.player, s)
    }
  },
  upgrades: [
    { id: 'power', name: '聚能飞弹', desc: '伤害 +3。', mods: { damage: 3 } },
    { id: 'reach', name: '远程飞弹', desc: '射程 +4。', mods: { range: 4 } },
    { id: 'pierce', name: '穿刺飞弹', desc: '飞弹继续飞行，命中目标身后的所有敌人。', flag: 'pierce' },
    { id: 'unerring', name: '无谬', desc: '无需视线。', flag: 'sightless' },
  ],
}

const poisonSting: SpellDef = {
  id: 'poison_sting', name: '毒刺', level: 1, charges: 20,
  tags: ['sorcery', 'nature'], icon: 'icon_poison_sting', color: NATURE,
  target: 'enemy',
  stats: { damage: 5, range: 7, duration: 8, poison_power: 1 },
  desc: s => `造成 ${s.st('damage')} 点毒素伤害，并使目标中毒 ${s.duration} 回合`
    + `（每回合 ${s.st('poison_power')} 点毒素伤害）。`
    + (s.has('spread') ? '与目标相邻的敌人也会中毒。' : ''),
  cast(s, g, x, y) {
    const target = g.level.unitAt(x, y)
    if (!target) return
    g.fx.bolt(g.player.x, g.player.y, x, y, NATURE)
    dealDamage(g, target, s.st('damage'), 'poison', g.player, s)
    applyStatus(g, target, 'poisoned', s.duration, s.st('poison_power'))
    if (!s.has('spread')) return
    for (const u of unitsNear(g, x, y, 1, isFoe)) {
      if (u === target) continue
      g.fx.flash(u.x, u.y, NATURE)
      applyStatus(g, u, 'poisoned', s.duration, s.st('poison_power'))
    }
  },
  upgrades: [
    { id: 'sting', name: '倒钩刺', desc: '伤害 +3。', mods: { damage: 3 } },
    { id: 'venom', name: '浓缩毒液', desc: '每回合毒素伤害 +2。', mods: { poison_power: 2 } },
    { id: 'lasting', name: '缓效毒液', desc: '中毒持续 +6 回合。', mods: { duration: 6 } },
    { id: 'spread', name: '传染', desc: '同时使与目标相邻的敌人中毒。', flag: 'spread' },
  ],
}

const annihilate: SpellDef = {
  id: 'annihilate', name: '歼灭', level: 2, charges: 10,
  tags: ['sorcery', 'arcane', 'chaos'], icon: 'icon_annihilate', color: CHAOS,
  target: 'enemy',
  stats: { damage: 15, range: 8 },
  desc: annihilateDesc,
  cast(s, g, x, y) {
    const target = g.level.unitAt(x, y)
    if (!target) return
    g.fx.bolt(g.player.x, g.player.y, x, y, CHAOS)
    g.fx.burst(x, y, 1, CHAOS)
    annihilateHits(s, g, target)
  },
  upgrades: [
    { id: 'might', name: '压倒', desc: '伤害 +6。', mods: { damage: 6 } },
    { id: 'reach', name: '远程歼灭', desc: '射程 +3。', mods: { range: 3 } },
    { id: 'quintessence', name: '五元', desc: '追加冰霜与黑暗打击。', flag: 'quintessence' },
    { id: 'unseen', name: '盲目歼灭', desc: '无需视线。', flag: 'sightless' },
  ],
}

const toxicSpores: SpellDef = {
  id: 'toxic_spores', name: '剧毒孢子', level: 2, charges: 16,
  tags: ['sorcery', 'nature'], icon: 'icon_toxic_spores', color: NATURE,
  target: 'tile',
  stats: { range: 8, radius: 2, duration: 5, power: 3 },
  desc: s => `在半径 ${s.radius} 的球形范围内生成毒云，持续 ${s.duration} 回合，`
    + `每回合造成 ${s.st('power')} 点毒素伤害。云雾不会伤害己方。`,
  aoe: (s, g, x, y) => ballPoints(x, y, s.radius),
  cast(s, g, x, y) {
    const tiles = ballPoints(x, y, s.radius).filter(p =>
      g.level.passable(p.x, p.y, true) && g.level.hasLOS(x, y, p.x, p.y))
    g.fx.bolt(g.player.x, g.player.y, x, y, NATURE)
    g.fx.area(tiles, NATURE)
    for (const p of tiles) spawnCloud(g, 'poison', p.x, p.y, s.duration, s.st('power'), 'player')
    g.log('孢子绽成一片绿雾。', NATURE)
  },
  upgrades: [
    { id: 'bloom', name: '广绽', desc: '半径 +1。', mods: { radius: 1 } },
    { id: 'potent', name: '剧毒', desc: '云雾伤害 +2。', mods: { power: 2 } },
    { id: 'lingering', name: '残留孢子', desc: '云雾持续 +3 回合。', mods: { duration: 3 } },
    { id: 'reach', name: '风载', desc: '射程 +3。', mods: { range: 3 } },
  ],
}

const melt: SpellDef = {
  id: 'melt', name: '熔解', level: 2, charges: 15,
  tags: ['sorcery', 'nature', 'fire'], icon: 'icon_melt', color: MELT,
  target: 'tile',
  stats: { damage: 12, range: 6, radius: 1, duration: 5 },
  desc: s => `对目标造成 ${s.st('damage')} 点火焰伤害，并使其熔蚀 ${s.duration} 回合`
    + `（易受物理、火焰与冰霜伤害）。摧毁 ${s.radius} 格内的墙壁。`
    + (s.has('spatter') ? '向附近的敌人溅射半数伤害。' : ''),
  aoe: (s, g, x, y) => ballPoints(x, y, s.radius),
  cast(s, g, x, y) {
    const dmg = s.st('damage')
    const tiles = ballPoints(x, y, s.radius)
    g.fx.bolt(g.player.x, g.player.y, x, y, MELT)
    g.fx.area(tiles, MELT)
    let dug = 0
    for (const p of tiles) if (digWall(g, p.x, p.y)) dug++
    const main = g.level.unitAt(x, y)
    if (main && main !== g.player) {
      dealDamage(g, main, dmg, 'fire', g.player, s)
      applyStatus(g, main, 'melted', s.duration)
    }
    if (s.has('spatter')) {
      const splash = Math.max(1, Math.floor(dmg / 2))
      for (const u of unitsNear(g, x, y, s.radius, isFoe)) {
        if (u === main) continue
        dealDamage(g, u, splash, 'fire', g.player, s)
        applyStatus(g, u, 'melted', s.duration)
      }
    }
    if (dug > 0) g.log(dug === 1 ? '一面墙壁熔成矿渣。' : `${dug} 面墙壁熔成矿渣。`, MELT)
  },
  upgrades: [
    { id: 'heat', name: '白热', desc: '伤害 +4。', mods: { damage: 4 } },
    { id: 'deep', name: '深熔', desc: '摧毁墙壁的半径 +1。', mods: { radius: 1 } },
    { id: 'lasting', name: '缓冷', desc: '熔蚀持续 +4 回合。', mods: { duration: 4 } },
    { id: 'spatter', name: '飞溅', desc: '范围内的敌人受到半数伤害并同样熔蚀。', flag: 'spatter' },
  ],
}

const moonGlaive: SpellDef = {
  id: 'moon_glaive', name: '月刃', level: 2, charges: 9,
  tags: ['sorcery', 'arcane'], icon: 'icon_moon_glaive', color: MOON,
  target: 'enemy',
  stats: { damage: 11, range: 7, num_targets: 3, cascade_range: 4, escalation: 0 },
  desc: s => `投出一枚月刃，造成 ${s.st('damage')} 点奥术伤害。它会弹向 ${s.st('cascade_range')} 格内`
    + `最近的新敌人，最多命中 ${s.st('num_targets')} 个生物。`
    + (s.st('escalation') > 0 ? `每次弹跳的伤害提高 ${s.st('escalation')} 点。` : ''),
  cast(s, g, x, y) {
    let target = g.level.unitAt(x, y)
    if (!target) return
    const hops = Math.max(1, s.st('num_targets'))
    const cascade = s.st('cascade_range')
    const step = s.st('escalation')
    const hit = new Set<number>()
    let fromX = g.player.x, fromY = g.player.y
    for (let i = 0; i < hops; i++) {
      hit.add(target.uid)
      g.fx.bolt(fromX, fromY, target.x, target.y, MOON)
      g.fx.strike(target.x, target.y, MOON)
      fromX = target.x; fromY = target.y
      dealDamage(g, target, s.st('damage') + step * i, 'arcane', g.player, s)
      const next = nearestFoe(g, fromX, fromY, cascade, hit)
      if (!next) break
      target = next
    }
  },
  upgrades: [
    { id: 'keen', name: '锋锐', desc: '伤害 +4。', mods: { damage: 4 } },
    { id: 'crescent', name: '新月', desc: '目标 +1。', mods: { num_targets: 1 } },
    { id: 'arc', name: '广弧', desc: '弹跳距离 +2。', mods: { cascade_range: 2 } },
    { id: 'waxing', name: '盈月', desc: '每次弹跳比上一次多造成 2 点伤害。', mods: { escalation: 2 } },
  ],
}

const petrify: SpellDef = {
  id: 'petrify', name: '石化术', level: 2, charges: 20,
  tags: ['enchantment', 'arcane'], icon: 'icon_petrify', color: STONE,
  target: 'enemy',
  stats: { range: 8, duration: 4 },
  desc: s => s.has('glass')
    ? `使一个生物琉璃化 ${s.duration} 回合：无法行动，且受到双倍物理伤害。`
    : `使一个生物石化 ${s.duration} 回合：无法行动，但抵抗物理、火焰、闪电与冰霜伤害。`,
  cast(s, g, x, y) {
    const target = g.level.unitAt(x, y)
    if (!target) return
    const id = s.has('glass') ? 'glassified' : 'petrified'
    g.fx.beam(g.player.x, g.player.y, x, y, STONE, 0.6)
    g.fx.flash(x, y, STONE)
    applyStatus(g, target, id, s.duration)
    g.log(`${target.name}${s.has('glass') ? '化为琉璃' : '化为石像'}。`, STONE)
    if (!s.has('spread')) return
    const half = Math.max(1, Math.floor(s.duration / 2))
    for (const u of unitsNear(g, x, y, 1, isFoe)) {
      if (u === target) continue
      applyStatus(g, u, id, half)
    }
  },
  upgrades: [
    { id: 'lasting', name: '深岩', desc: '持续 +3 回合。', mods: { duration: 3 } },
    { id: 'reach', name: '远瞰', desc: '射程 +4。', mods: { range: 4 } },
    { id: 'glass', name: '琉璃化', desc: '改为使目标琉璃化：受到双倍物理伤害。', flag: 'glass' },
    { id: 'spread', name: '蔓延石化', desc: '相邻的敌人也会被波及，持续时间减半。', flag: 'spread' },
  ],
}

const earthquake: SpellDef = {
  id: 'earthquake', name: '地震', level: 3, charges: 4,
  tags: ['sorcery', 'nature'], icon: 'icon_earthquake', color: EARTH,
  target: 'self', requiresLOS: false,
  stats: { damage: 18 },
  desc: s => `对领域内的每个生物造成 ${s.st('damage')} 点物理伤害。`
    + (s.has('airborne') ? '' : '飞行生物不受影响。')
    + (s.has('indiscriminate') ? '自己的随从同样会被震到。' : '随从不受影响。')
    + (s.has('aftershock') ? '被命中的一切眩晕 1 回合。' : ''),
  cast(s, g) {
    const dmg = s.st('damage')
    const hitFlyers = s.has('airborne')
    const hitOwn = s.has('indiscriminate')
    const stun = s.has('aftershock')
    const shaken = g.level.units.filter(u =>
      u.alive && !u.isPlayer && (hitFlyers || !u.flying) && (hitOwn || u.team !== 'player'))
    g.fx.burst(g.player.x, g.player.y, 3, EARTH)
    g.fx.area(shaken.map(u => ({ x: u.x, y: u.y })), EARTH)
    g.log('地面隆起、崩裂。', EARTH)
    for (const u of shaken) {
      if (!u.alive) continue
      dealDamage(g, u, dmg, 'physical', g.player, s)
      if (stun) applyStatus(g, u, 'stunned', 1)
    }
  },
  upgrades: [
    { id: 'tremor', name: '深层震颤', desc: '伤害 +5。', mods: { damage: 5 } },
    { id: 'airborne', name: '冲击波', desc: '同时命中飞行生物。', flag: 'airborne' },
    { id: 'aftershock', name: '余震', desc: '被命中的一切眩晕 1 回合。', flag: 'aftershock' },
    { id: 'indiscriminate', name: '全面崩塌', desc: '伤害 +7，但自己的随从也会被震到。', mods: { damage: 7 }, flag: 'indiscriminate' },
  ],
}

let prisonSeq = 0

const prisonOfThorns: SpellDef = {
  id: 'prison_of_thorns', name: '荆棘牢笼', level: 3, charges: 6,
  tags: ['enchantment', 'nature'], icon: 'icon_prison_of_thorns', color: NATURE,
  target: 'tile',
  stats: { range: 8, radius: 2, duration: 8, damage: 0 },
  desc: s => `在半径 ${s.radius} 处升起一圈荆棘墙，`
    + `使其中的敌人缠绕 ${s.duration} 回合。`
    + (s.st('damage') > 0 ? `荆棘每回合造成 ${s.st('damage')} 点毒素伤害。` : '')
    + (s.has('overgrowth') ? '荆棘墙永不枯萎。' : '缠绕结束时荆棘墙枯萎。'),
  aoe: (s, g, x, y) => ballPoints(x, y, s.radius),
  cast(s, g, x, y) {
    const lvl = g.level
    const radius = Math.max(1, s.radius)
    const dur = s.duration
    const thorns = s.has('barbed') ? s.st('damage') : 0
    const permanent = s.has('overgrowth')
    const made: Point[] = []
    for (const p of ringPoints(x, y, radius)) {
      if (!lvl.inBounds(p.x, p.y)) continue
      if (lvl.get(p.x, p.y) !== Tile.Floor) continue
      if (lvl.unitAt(p.x, p.y)) continue
      if (lvl.itemAt(p.x, p.y) || lvl.portalAt(p.x, p.y)) continue
      // never seal the wizard in: leave his own tile and its neighbours open
      if (cheb(p.x, p.y, g.player.x, g.player.y) <= 1) continue
      lvl.set(p.x, p.y, Tile.Wall)
      made.push(p)
    }
    g.fx.ring(x, y, radius, NATURE)
    g.fx.area(made, NATURE)
    for (const u of unitsNear(g, x, y, radius, isFoe)) applyStatus(g, u, 'rooted', dur)
    g.log('带刺藤蔓自地下暴起。', NATURE)
    if (thorns <= 0 && permanent) return
    applyBuff(g, g.player, {
      id: `thorn_prison_${prisonSeq++}`, name: '荆棘牢笼', kind: 'buff',
      duration: dur, color: NATURE, hidden: true,
      onTurnEnd(_owner, gg) {
        if (thorns <= 0 || gg.level !== lvl) return
        for (const u of unitsNear(gg, x, y, radius, isFoe)) {
          dealDamage(gg, u, thorns, 'poison', gg.player, s)
        }
      },
      onExpire(_owner, gg) {
        if (permanent || gg.level !== lvl) return
        for (const p of made) if (lvl.get(p.x, p.y) === Tile.Wall) lvl.set(p.x, p.y, Tile.Floor)
        if (made.length) gg.log('荆棘墙枯萎散去。', NATURE)
      },
    })
  },
  upgrades: [
    { id: 'wide', name: '更大牢笼', desc: '半径 +1。', mods: { radius: 1 } },
    { id: 'lasting', name: '顽根', desc: '持续 +4 回合。', mods: { duration: 4 } },
    { id: 'barbed', name: '倒刺藤蔓', desc: '荆棘每回合对笼中的一切造成 4 点毒素伤害。', mods: { damage: 4 }, flag: 'barbed' },
    { id: 'overgrowth', name: '蔓生', desc: '荆棘墙永久存在。', flag: 'overgrowth' },
  ],
}

const disperse: SpellDef = {
  id: 'disperse', name: '驱散位移', level: 2, charges: 15,
  tags: ['sorcery', 'arcane', 'translocation'], icon: 'icon_disperse', color: ARCANE,
  target: 'tile',
  stats: { range: 8, radius: 3, banish_range: 6, damage: 0 },
  desc: s => `将 ${s.radius} 格内的所有敌人随机传送到远离自身的空地上。`
    + (s.st('damage') > 0 ? `每个目标受到 ${s.st('damage')} 点奥术伤害。` : '')
    + (s.has('disorient') ? '它们落地时眩晕 1 回合。' : ''),
  aoe: (s, g, x, y) => ballPoints(x, y, s.radius),
  cast(s, g, x, y) {
    const targets = unitsNear(g, x, y, s.radius, isFoe)
    if (!targets.length) return
    const away = s.st('banish_range')
    const far: Point[] = []
    const any: Point[] = []
    for (const p of g.level.floorTiles()) {
      if (!g.level.vacant(p.x, p.y)) continue
      any.push(p)
      if (cheb(p.x, p.y, g.player.x, g.player.y) >= away) far.push(p)
    }
    const spots = far.length ? far : any
    g.rng.shuffle(spots)
    g.fx.burst(x, y, s.radius, ARCANE)
    const burn = s.st('damage')
    for (const u of targets) {
      const spot = spots.pop()
      if (!spot) break
      if (!teleportUnit(g, u, spot.x, spot.y)) continue
      if (s.has('disorient')) applyStatus(g, u, 'stunned', 1)
      if (burn > 0) dealDamage(g, u, burn, 'arcane', g.player, s)
    }
    g.log('裂隙把它们吐到了别处。', ARCANE)
  },
  upgrades: [
    { id: 'wide', name: '广域驱散', desc: '半径 +1。', mods: { radius: 1 } },
    { id: 'reach', name: '远域驱散', desc: '射程 +3。', mods: { range: 3 } },
    { id: 'disorient', name: '迷向', desc: '被移走的敌人眩晕 1 回合。', flag: 'disorient' },
    { id: 'unstable', name: '不稳裂隙', desc: '被移走的敌人受到 7 点奥术伤害。', mods: { damage: 7 }, flag: 'unstable' },
  ],
}

const megaAnnihilate: SpellDef = {
  id: 'mega_annihilate', name: '超级歼灭', level: 5, charges: 3,
  tags: ['sorcery', 'arcane', 'chaos'], icon: 'icon_mega_annihilate', color: ARCANE,
  target: 'enemy',
  stats: { damage: 32, range: 8, cascade_range: 5 },
  desc: s => annihilateDesc(s)
    + (s.has('overkill') ? `若目标死亡，爆发会跳向 ${s.st('cascade_range')} 格内最近的敌人。` : ''),
  cast(s, g, x, y) {
    let target = g.level.unitAt(x, y)
    if (!target) return
    let bursts = s.has('overkill') ? 3 : 1
    let fromX = g.player.x, fromY = g.player.y
    const hit = new Set<number>()
    while (bursts > 0) {
      bursts--
      g.fx.bolt(fromX, fromY, target.x, target.y, ARCANE)
      g.fx.burst(target.x, target.y, 1, ARCANE)
      fromX = target.x; fromY = target.y
      annihilateHits(s, g, target)
      if (target.alive || bursts <= 0) break
      hit.add(target.uid)
      const next = nearestFoe(g, fromX, fromY, s.st('cascade_range'), hit)
      if (!next) break
      target = next
    }
  },
  upgrades: [
    { id: 'might', name: '彻底歼灭', desc: '伤害 +9。', mods: { damage: 9 } },
    { id: 'reach', name: '远程歼灭', desc: '射程 +3。', mods: { range: 3 } },
    { id: 'quintessence', name: '五元', desc: '追加冰霜与黑暗打击。', flag: 'quintessence' },
    { id: 'overkill', name: '过量杀伤', desc: '击杀时爆发跳向最近的敌人，最多 2 次。', flag: 'overkill' },
  ],
}

const SEEDLING_HP = 18
const SEEDLING_DAMAGE = 7

/** Arm (or re-arm) the seedling's growth timer. */
function germinate(s: SpellInst, g: Game, host: Unit): void {
  const grow = Math.max(1, s.st('grow_time'))
  applyBuff(g, host, {
    id: 'germinating', name: '萌发中', kind: 'buff', duration: grow, color: MIND,
    desc: `经过 ${grow} 回合后萌出一株树人幼苗。`,
    onExpire(u, gg) {
      if (!u.alive) return
      const sapling = summonUnit(gg, 'treant_sapling', u.x, u.y, {
        team: u.team, summoner: u.summoner ?? gg.player, quiet: true,
      })
      if (sapling) gg.log(`${u.name} 萌出了 ${sapling.name}。`, '#9affc0')
      if (s.has('evergreen')) germinate(s, gg, u)
    },
  })
}

const psychicSeedling: SpellDef = {
  id: 'psychic_seedling', name: '灵能苗', level: 3, charges: 5,
  tags: ['conjuration', 'nature', 'arcane'], icon: 'icon_psychic_seedling', color: MIND,
  target: 'empty',
  stats: { range: 5, minion_health: SEEDLING_HP, minion_damage: SEEDLING_DAMAGE, minion_range: 6, grow_time: 8 },
  desc: s => `种下一株固定不动的灵能苗，拥有 ${s.st('minion_health')} 点生命，`
    + `以射程 ${s.st('minion_range')} 的灵能箭造成 ${s.st('minion_damage')} 点伤害。`
    + `经过 ${s.st('grow_time')} 回合后萌出一株树人幼苗`
    + (s.has('evergreen') ? '，此后每个周期都会再萌出一株。' : '。'),
  cast(s, g, x, y) {
    const u = summonUnit(g, 'seedling_psychic', x, y, { team: 'player', summoner: g.player })
    if (!u) return
    const hpDelta = s.st('minion_health') - SEEDLING_HP
    if (hpDelta !== 0) u.maxHP = Math.max(1, u.maxHP + hpDelta)
    u.hp = u.maxHP
    const dmgDelta = s.st('minion_damage') - SEEDLING_DAMAGE
    for (const a of u.attacks) {
      if (a.damage) a.damage = Math.max(1, a.damage + dmgDelta)
      if (a.kind === 'bolt') a.range = s.st('minion_range')
    }
    germinate(s, g, u)
  },
  upgrades: [
    { id: 'hardy', name: '强健种源', desc: '随从生命 +12。', mods: { minion_health: 12 } },
    { id: 'focus', name: '锐利心智', desc: '随从伤害 +3。', mods: { minion_damage: 3 } },
    { id: 'quick', name: '催生', desc: '提前 3 回合萌出。', mods: { grow_time: -3 } },
    { id: 'evergreen', name: '常青', desc: '灵能苗每个周期都会继续萌出幼苗。', flag: 'evergreen' },
  ],
}

export const spells: SpellDef[] = [
  magicMissile, poisonSting, annihilate, toxicSpores, melt, moonGlaive, petrify,
  earthquake, prisonOfThorns, disperse, megaAnnihilate, psychicSeedling,
]

// --------------------------------------------------------------------- units

export const units: UnitDef[] = [
  {
    id: 'seedling_psychic', name: '灵能苗', sprite: 'mon_seedling_psychic', color: MIND,
    maxHP: SEEDLING_HP, level: 2, team: 'player', stationary: true,
    tags: ['nature', 'arcane'],
    resists: { arcane: 50, dark: -50 },
    attacks: [{
      kind: 'bolt', name: '灵能箭', range: 6, damage: SEEDLING_DAMAGE,
      damageType: 'arcane', color: ARCANE,
    }],
    description: '扎根的芽苗，长着一只巨眼。它用意念盯着目标，直到对方不再动弹。',
  },
  {
    id: 'treant_sapling', name: '树人幼苗', sprite: 'mon_treant_sapling', color: '#7ad04a',
    maxHP: 26, level: 3, team: 'player',
    tags: ['nature'],
    resists: { poison: 100, physical: 25, fire: -50 },
    attacks: [{ kind: 'melee', name: '荆棘拳', damage: 8, damageType: 'physical', color: NATURE }],
    description: '年轻、暴躁、一身木头。别让它靠近火。',
  },
]

// ------------------------------------------------------------------- sprites

export const sprites: Record<string, SpriteDef> = {
  icon_magic_missile: {
    palette: ['#8ad8ff', '#e8f8ff', '#12304a'],
    shapes: [
      { t: 'line', pts: [0.5, 0.5, 0.12, 0.9], stroke: '$0', w: 0.06 },
      { t: 'line', pts: [0.34, 0.5, 0.18, 0.66], stroke: '$0', w: 0.03 },
      { t: 'line', pts: [0.5, 0.72, 0.34, 0.88], stroke: '$0', w: 0.03 },
      { t: 'poly', pts: [0.66, 0.18, 0.82, 0.34, 0.66, 0.5, 0.5, 0.34], fill: '$2', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.66, y: 0.34, r: 0.06, fill: '$0' },
      { t: 'line', pts: [0.66, 0.05, 0.66, 0.17], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.95, 0.34, 0.83, 0.34], stroke: '$1', w: 0.035 },
    ],
  },
  icon_poison_sting: {
    palette: ['#5ad04a', '#c8ff9a', '#132e14'],
    shapes: [
      { t: 'blob', x: 0.34, y: 0.66, r: 0.2, lobes: 5, fill: '$2', stroke: '$0', w: 0.045 },
      { t: 'poly', pts: [0.42, 0.5, 0.88, 0.12, 0.6, 0.56], fill: '$2', stroke: '$0', w: 0.04 },
      { t: 'line', pts: [0.5, 0.48, 0.85, 0.15], stroke: '$1', w: 0.03 },
      { t: 'circle', x: 0.3, y: 0.62, r: 0.045, fill: '$1' },
      { t: 'circle', x: 0.72, y: 0.72, r: 0.07, fill: '$2', stroke: '$1', w: 0.025 },
      { t: 'circle', x: 0.58, y: 0.88, r: 0.045, fill: '$0' },
    ],
  },
  icon_annihilate: {
    palette: ['#ff5219', '#ffe019', '#c8ccd8', '#2a1a10'],
    shapes: [
      { t: 'line', pts: [0.5, 0.5, 0.12, 0.2], stroke: '$0', w: 0.06 },
      { t: 'line', pts: [0.5, 0.5, 0.9, 0.26], stroke: '$1', w: 0.06 },
      { t: 'line', pts: [0.5, 0.5, 0.56, 0.94], stroke: '$2', w: 0.06 },
      { t: 'blob', x: 0.5, y: 0.5, r: 0.2, lobes: 6, fill: '$3', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.12, y: 0.2, r: 0.055, fill: '$0' },
      { t: 'circle', x: 0.9, y: 0.26, r: 0.055, fill: '$1' },
      { t: 'circle', x: 0.56, y: 0.94, r: 0.055, fill: '$2' },
    ],
  },
  icon_toxic_spores: {
    palette: ['#5ad04a', '#a8ff8a', '#16301a'],
    shapes: [
      { t: 'blob', x: 0.5, y: 0.62, r: 0.26, lobes: 7, fill: '$2', stroke: '$0', w: 0.05 },
      { t: 'poly', pts: [0.44, 0.74, 0.42, 0.94, 0.58, 0.94, 0.56, 0.74], fill: '$2', stroke: '$0', w: 0.035 },
      { t: 'arc', x: 0.5, y: 0.62, r: 0.16, a0: 0.2, a1: 2.9, stroke: '$1', w: 0.03 },
      { t: 'circle', x: 0.26, y: 0.3, r: 0.055, fill: '$1' },
      { t: 'circle', x: 0.5, y: 0.16, r: 0.065, fill: '$1' },
      { t: 'circle', x: 0.74, y: 0.32, r: 0.05, fill: '$1' },
      { t: 'circle', x: 0.62, y: 0.42, r: 0.035, fill: '$0' },
    ],
  },
  icon_melt: {
    palette: ['#ff8f5a', '#ffd8a0', '#3a1a10', '#7a6a5a'],
    shapes: [
      { t: 'rect', x: 0.22, y: 0.12, w: 0.52, h: 0.32, fill: '$3', stroke: '$1', sw: 0.04 },
      { t: 'blob', x: 0.34, y: 0.5, r: 0.12, lobes: 4, fill: '$2', stroke: '$0', w: 0.035 },
      { t: 'blob', x: 0.62, y: 0.52, r: 0.1, lobes: 4, fill: '$2', stroke: '$0', w: 0.035 },
      { t: 'line', pts: [0.32, 0.6, 0.3, 0.8], stroke: '$0', w: 0.05 },
      { t: 'circle', x: 0.3, y: 0.86, r: 0.06, fill: '$2', stroke: '$0', w: 0.03 },
      { t: 'ellipse', x: 0.52, y: 0.9, rx: 0.3, ry: 0.07, fill: '$2', stroke: '$0', w: 0.035 },
    ],
  },
  icon_moon_glaive: {
    palette: ['#c8e8ff', '#ffffff', '#16264a'],
    shapes: [
      { t: 'arc', x: 0.5, y: 0.5, r: 0.3, a0: -2.2, a1: 1.0, stroke: '$2', w: 0.22 },
      { t: 'arc', x: 0.5, y: 0.5, r: 0.38, a0: -2.1, a1: 0.95, stroke: '$0', w: 0.05 },
      { t: 'arc', x: 0.5, y: 0.5, r: 0.22, a0: -1.9, a1: 0.8, stroke: '$1', w: 0.03 },
      { t: 'line', pts: [0.24, 0.88, 0.58, 0.44], stroke: '#8a6a4a', w: 0.05 },
      { t: 'circle', x: 0.22, y: 0.9, r: 0.055, fill: '$2', stroke: '$0', w: 0.03 },
      { t: 'circle', x: 0.32, y: 0.26, r: 0.04, fill: '$1' },
    ],
  },
  icon_petrify: {
    palette: ['#b0a898', '#e8e0d0', '#28241e'],
    shapes: [
      { t: 'blob', x: 0.5, y: 0.55, r: 0.3, lobes: 5, fill: '$2', stroke: '$0', w: 0.05 },
      { t: 'line', pts: [0.34, 0.3, 0.46, 0.48, 0.36, 0.72], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.64, 0.28, 0.58, 0.46, 0.72, 0.62], stroke: '$1', w: 0.03 },
      { t: 'circle', x: 0.42, y: 0.52, r: 0.035, fill: '$1' },
      { t: 'circle', x: 0.6, y: 0.52, r: 0.035, fill: '$1' },
      { t: 'arc', x: 0.5, y: 0.6, r: 0.13, a0: 0.4, a1: 2.7, stroke: '$1', w: 0.03 },
    ],
  },
  icon_earthquake: {
    palette: ['#c8a878', '#ffd8a0', '#38281a'],
    shapes: [
      { t: 'rect', x: 0.06, y: 0.48, w: 0.88, h: 0.44, fill: '$2', stroke: '$0', sw: 0.04 },
      { t: 'poly', pts: [0.42, 0.48, 0.32, 0.68, 0.46, 0.76, 0.36, 0.92, 0.58, 0.92, 0.52, 0.72, 0.62, 0.6, 0.54, 0.48], fill: '#0a0a12', stroke: '$1', w: 0.03 },
      { t: 'line', pts: [0.14, 0.34, 0.28, 0.2], stroke: '$1', w: 0.045 },
      { t: 'line', pts: [0.86, 0.34, 0.72, 0.2], stroke: '$1', w: 0.045 },
      { t: 'circle', x: 0.2, y: 0.4, r: 0.055, fill: '$2', stroke: '$0', w: 0.03 },
      { t: 'circle', x: 0.78, y: 0.42, r: 0.045, fill: '$2', stroke: '$0', w: 0.03 },
    ],
  },
  icon_prison_of_thorns: {
    palette: ['#5ad04a', '#c8ff9a', '#183a18'],
    shapes: [
      { t: 'line', pts: [0.22, 0.94, 0.3, 0.5, 0.2, 0.08], stroke: '$0', w: 0.055 },
      { t: 'line', pts: [0.5, 0.96, 0.44, 0.5, 0.52, 0.06], stroke: '$0', w: 0.055 },
      { t: 'line', pts: [0.78, 0.94, 0.7, 0.5, 0.8, 0.08], stroke: '$0', w: 0.055 },
      { t: 'line', pts: [0.14, 0.34, 0.86, 0.3], stroke: '$0', w: 0.04 },
      { t: 'poly', pts: [0.3, 0.52, 0.44, 0.42, 0.3, 0.44], fill: '$1' },
      { t: 'poly', pts: [0.7, 0.52, 0.56, 0.42, 0.7, 0.44], fill: '$1' },
      { t: 'circle', x: 0.5, y: 0.66, r: 0.07, fill: '$2', stroke: '#d02b3a', w: 0.03 },
    ],
  },
  icon_disperse: {
    palette: ['#ff5cc8', '#ffd0f0', '#3a0a2a'],
    shapes: [
      { t: 'circle', x: 0.5, y: 0.5, r: 0.11, fill: '$2', stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.5, 0.38, 0.5, 0.16], stroke: '$0', w: 0.05 },
      { t: 'line', pts: [0.5, 0.62, 0.5, 0.84], stroke: '$0', w: 0.05 },
      { t: 'line', pts: [0.38, 0.5, 0.16, 0.5], stroke: '$0', w: 0.05 },
      { t: 'line', pts: [0.62, 0.5, 0.84, 0.5], stroke: '$0', w: 0.05 },
      { t: 'poly', pts: [0.5, 0.04, 0.4, 0.18, 0.6, 0.18], fill: '$1' },
      { t: 'poly', pts: [0.5, 0.96, 0.4, 0.82, 0.6, 0.82], fill: '$1' },
      { t: 'poly', pts: [0.04, 0.5, 0.18, 0.4, 0.18, 0.6], fill: '$1' },
      { t: 'poly', pts: [0.96, 0.5, 0.82, 0.4, 0.82, 0.6], fill: '$1' },
    ],
  },
  icon_mega_annihilate: {
    palette: ['#ff5219', '#ffe019', '#c8ccd8', '#2a1a10', '#ff5cc8'],
    shapes: [
      { t: 'circle', x: 0.5, y: 0.5, r: 0.42, stroke: '$4', w: 0.035 },
      { t: 'line', pts: [0.5, 0.5, 0.1, 0.16], stroke: '$0', w: 0.07 },
      { t: 'line', pts: [0.5, 0.5, 0.92, 0.22], stroke: '$1', w: 0.07 },
      { t: 'line', pts: [0.5, 0.5, 0.54, 0.96], stroke: '$2', w: 0.07 },
      { t: 'blob', x: 0.5, y: 0.5, r: 0.22, lobes: 6, fill: '$3', stroke: '$4', w: 0.045 },
      { t: 'circle', x: 0.1, y: 0.16, r: 0.055, fill: '$0' },
      { t: 'circle', x: 0.92, y: 0.22, r: 0.055, fill: '$1' },
      { t: 'circle', x: 0.54, y: 0.96, r: 0.055, fill: '$2' },
    ],
  },
  icon_psychic_seedling: {
    palette: ['#b0ffd8', '#ff5cc8', '#12352a', '#5ad04a'],
    shapes: [
      { t: 'blob', x: 0.5, y: 0.8, r: 0.16, lobes: 5, fill: '$2', stroke: '$3', w: 0.04 },
      { t: 'line', pts: [0.5, 0.8, 0.5, 0.44], stroke: '$3', w: 0.05 },
      { t: 'poly', pts: [0.5, 0.56, 0.22, 0.46, 0.44, 0.64], fill: '$2', stroke: '$3', w: 0.03 },
      { t: 'poly', pts: [0.5, 0.56, 0.78, 0.46, 0.56, 0.64], fill: '$2', stroke: '$3', w: 0.03 },
      { t: 'circle', x: 0.5, y: 0.3, r: 0.16, fill: '$2', stroke: '$0', w: 0.045 },
      { t: 'circle', x: 0.5, y: 0.3, r: 0.06, fill: '$1' },
      { t: 'arc', x: 0.5, y: 0.3, r: 0.26, a0: -2.6, a1: -0.5, stroke: '$1', w: 0.03 },
    ],
  },
  mon_seedling_psychic: {
    palette: ['#b0ffd8', '#ff5cc8', '#123028', '#5ad04a'],
    wobble: 0.5,
    shapes: [
      { t: 'line', pts: [0.3, 0.94, 0.5, 0.74], stroke: '$3', w: 0.04 },
      { t: 'line', pts: [0.7, 0.94, 0.5, 0.74], stroke: '$3', w: 0.04 },
      { t: 'poly', pts: [0.5, 0.36, 0.64, 0.82, 0.36, 0.82], fill: '$2', stroke: '$3', w: 0.045 },
      { t: 'poly', pts: [0.44, 0.56, 0.14, 0.5, 0.4, 0.68], fill: '$2', stroke: '$3', w: 0.03 },
      { t: 'poly', pts: [0.56, 0.56, 0.86, 0.5, 0.6, 0.68], fill: '$2', stroke: '$3', w: 0.03 },
      { t: 'circle', x: 0.5, y: 0.3, r: 0.17, fill: '$2', stroke: '$0', w: 0.045 },
      { t: 'circle', x: 0.5, y: 0.3, r: 0.08, fill: '$1' },
      { t: 'circle', x: 0.5, y: 0.3, r: 0.03, fill: '#101018' },
      { t: 'arc', x: 0.5, y: 0.3, r: 0.27, a0: -2.5, a1: -0.6, stroke: '$1', w: 0.028 },
    ],
  },
  mon_treant_sapling: {
    palette: ['#7ad04a', '#c8ff9a', '#243318', '#8a6a4a'],
    wobble: 0.6,
    shapes: [
      { t: 'poly', pts: [0.42, 0.34, 0.34, 0.94, 0.66, 0.94, 0.58, 0.34], fill: '$2', stroke: '$3', w: 0.045 },
      { t: 'line', pts: [0.42, 0.52, 0.14, 0.34], stroke: '$3', w: 0.055 },
      { t: 'line', pts: [0.58, 0.52, 0.86, 0.36], stroke: '$3', w: 0.055 },
      { t: 'blob', x: 0.5, y: 0.26, r: 0.26, lobes: 6, fill: '$2', stroke: '$0', w: 0.05 },
      { t: 'blob', x: 0.14, y: 0.3, r: 0.1, lobes: 4, fill: '$2', stroke: '$0', w: 0.03 },
      { t: 'blob', x: 0.86, y: 0.32, r: 0.09, lobes: 4, fill: '$2', stroke: '$0', w: 0.03 },
      { t: 'circle', x: 0.44, y: 0.62, r: 0.035, fill: '$1' },
      { t: 'circle', x: 0.58, y: 0.62, r: 0.035, fill: '$1' },
    ],
  },
}
