import type { SpellDef, SpellInst } from '../../core/spell'
import type { Buff, Unit, UnitDef } from '../../core/unit'
import type { Game } from '../../core/game'
import type { Point } from '../../core/types'
import type { SpriteDef } from '../../render/sprite'
import { ballPoints, cheb } from '../../core/geom'
import {
  applyBuff, dealDamage, digWall, pullUnit, removeBuff,
  summonUnit, teleportUnit, unitsNear,
} from '../../core/combat'
import { makeBuff } from '../../core/buffs'
import { spawnCloud } from '../../core/clouds'

const ICE = '#7fd8ff'
const LIGHTNING = '#ffe019'

/** Base profile of the conjured orb; the spell only ever applies deltas to it. */
const ORB_HP = 25
const ORB_DAMAGE = 9

// --------------------------------------------------------------------- helpers

/**
 * End point of a ray leaving (fx,fy) through (tx,ty), `len` tiles out and
 * optionally rotated by `angle` radians. Used for beams that carry on past the
 * aimed tile, and for the forked-bolt upgrade.
 */
function rayEnd(fx: number, fy: number, tx: number, ty: number, len: number, angle = 0): Point {
  const dx = tx - fx, dy = ty - fy
  const d = Math.hypot(dx, dy)
  if (d < 0.001) return { x: tx, y: ty }
  const ux = dx / d, uy = dy / d
  const c = Math.cos(angle), s = Math.sin(angle)
  return {
    x: Math.round(fx + (ux * c - uy * s) * len),
    y: Math.round(fy + (ux * s + uy * c) * len),
  }
}

/**
 * Tiles a bolt covers: the ray carries on past the aimed tile to full range,
 * and the forked upgrade adds both 45 degree branches.
 */
function beamTiles(s: SpellInst, g: Game, x: number, y: number): Point[] {
  const r = s.range
  const out: Point[] = []
  for (const a of s.has('forked') ? [0, -Math.PI / 4, Math.PI / 4] : [0]) {
    const e = rayEnd(g.player.x, g.player.y, x, y, r, a)
    for (const p of g.level.raycast(g.player.x, g.player.y, e.x, e.y, r)) out.push(p)
  }
  return out
}

/** Apply a registry status effect, tolerating an id the engine does not know. */
function inflict(g: Game, u: Unit, id: string, duration: number): void {
  const b = makeBuff(id, duration)
  if (b) applyBuff(g, u, b)
}

/** Conductance that also earths through the victim, stunning it on every zap. */
function groundedConductance(duration: number): Buff {
  return {
    id: 'conductance', name: '导电', kind: 'debuff', duration, color: LIGHTNING,
    resists: { lightning: -100 },
    desc: '受到双倍闪电伤害。每次被闪电命中都会眩晕。',
    onHurt(u, g, ev) {
      if (ev.type !== 'lightning') return
      inflict(g, u, 'stunned', 1)
    },
  }
}

// ---------------------------------------------------------------------- spells

const icicle: SpellDef = {
  id: 'icicle', name: '冰锥', level: 1, charges: 22,
  tags: ['sorcery', 'ice'], icon: 'icon_icicle', color: ICE,
  target: 'enemy',
  stats: { damage: 7, range: 8, freeze_chance: 25, duration: 2 },
  desc: s => `对单个敌人造成 ${s.st('damage')} 点冰霜伤害，有 `
    + `${s.st('freeze_chance')}% 概率使其冰冻 ${s.duration} 回合。`
    + (s.has('shatter') ? '已冰冻的目标受到双倍伤害。' : '')
    + (s.has('pierce') ? '并继续贯入目标身后的格子。' : ''),
  cast(s, g, x, y) {
    const first = g.level.unitAt(x, y)
    if (!first) return
    const base = s.st('damage')
    const odds = s.st('freeze_chance') / 100
    const hit = (u: Unit): void => {
      const amount = s.has('shatter') && u.hasBuff('frozen') ? base * 2 : base
      dealDamage(g, u, amount, 'ice', g.player, s)
      if (u.alive && g.rng.chance(odds)) inflict(g, u, 'frozen', s.duration)
    }
    g.fx.bolt(g.player.x, g.player.y, x, y, ICE)
    hit(first)
    if (!s.has('pierce')) return
    const d = Math.hypot(x - g.player.x, y - g.player.y)
    const p = rayEnd(g.player.x, g.player.y, x, y, d + 1)
    if (p.x === x && p.y === y) return
    g.fx.bolt(x, y, p.x, p.y, ICE)
    const behind = g.level.unitAt(p.x, p.y)
    if (behind && behind.team !== 'player') hit(behind)
  },
  upgrades: [
    { id: 'honed', name: '锐锋', desc: '伤害 +4。', mods: { damage: 4 } },
    { id: 'chill', name: '深寒', desc: '冰冻概率 +35%。', mods: { freeze_chance: 35 } },
    { id: 'shatter', name: '碎冰', desc: '对已冰冻目标造成双倍伤害。', flag: 'shatter' },
    { id: 'pierce', name: '穿刺', desc: '同时命中目标身后的格子。', flag: 'pierce' },
  ],
}

const lightningBolt: SpellDef = {
  id: 'lightning_bolt', name: '闪电束', level: 1, charges: 18,
  tags: ['sorcery', 'lightning'], icon: 'icon_lightning_bolt', color: LIGHTNING,
  target: 'tile',
  stats: { damage: 7, range: 9, duration: 3 },
  desc: s => `对一条长 ${s.range} 格的直线上的所有单位造成 `
    + `${s.st('damage')} 点闪电伤害。`
    + (s.has('conduct') ? `目标在 ${s.duration} 回合内受到双倍闪电伤害。` : '')
    + (s.has('forked') ? '同时沿两侧 45 度分叉射出。' : ''),
  aoe: beamTiles,
  cast(s, g, x, y) {
    const dmg = s.st('damage')
    const r = s.range
    const seen = new Set<number>()
    for (const a of s.has('forked') ? [0, -Math.PI / 4, Math.PI / 4] : [0]) {
      const e = rayEnd(g.player.x, g.player.y, x, y, r, a)
      const path = g.level.raycast(g.player.x, g.player.y, e.x, e.y, r)
      const tip = path.length ? path[path.length - 1] : { x, y }
      g.fx.beam(g.player.x, g.player.y, tip.x, tip.y, LIGHTNING, 1)
      for (const p of path) {
        const u = g.level.unitAt(p.x, p.y)
        if (!u || u.team === 'player' || seen.has(u.uid)) continue
        seen.add(u.uid)
        dealDamage(g, u, dmg, 'lightning', g.player, s)
        if (s.has('conduct') && u.alive) inflict(g, u, 'conductance', s.duration)
      }
    }
  },
  upgrades: [
    { id: 'volts', name: '高压', desc: '伤害 +4。', mods: { damage: 4 } },
    { id: 'reach', name: '远击', desc: '射程 +5。', mods: { range: 5 } },
    { id: 'conduct', name: '电离', desc: '使目标导电：受到双倍闪电伤害。', flag: 'conduct' },
    { id: 'forked', name: '分叉闪电', desc: '同时沿两条对角线射出。', flag: 'forked' },
  ],
}

const freeze: SpellDef = {
  id: 'freeze', name: '冰封', level: 2, charges: 20,
  tags: ['sorcery', 'ice'], icon: 'icon_freeze', color: ICE,
  target: 'enemy',
  stats: { damage: 8, range: 7, duration: 3 },
  desc: s => (s.has('glass')
    ? `造成 ${s.st('damage')} 点冰霜伤害，并使单个敌人琉璃化 ${s.duration} 回合：无法行动，且受到双倍物理伤害。`
    : `造成 ${s.st('damage')} 点冰霜伤害，并使单个敌人冰冻 ${s.duration} 回合。`)
    + (s.has('spread') ? '与目标相邻的敌人一并冻住。' : ''),
  cast(s, g, x, y) {
    const target = g.level.unitAt(x, y)
    if (!target) return
    const lock = (u: Unit): void => {
      if (u.alive) inflict(g, u, s.has('glass') ? 'glassified' : 'frozen', s.duration)
    }
    g.fx.bolt(g.player.x, g.player.y, x, y, ICE)
    g.fx.flash(x, y, ICE)
    dealDamage(g, target, s.st('damage'), 'ice', g.player, s)
    lock(target)
    if (!s.has('spread')) return
    for (const u of unitsNear(g, x, y, 1.5, c => c.team === 'enemy')) {
      if (u === target) continue
      g.fx.flash(u.x, u.y, ICE)
      lock(u)
    }
  },
  upgrades: [
    { id: 'bite', name: '霜噬', desc: '伤害 +5。', mods: { damage: 5 } },
    { id: 'deep', name: '深度冷冻', desc: '持续 +3 回合。', mods: { duration: 3 } },
    { id: 'spread', name: '白霜', desc: '同时锁住与目标相邻的敌人。', flag: 'spread' },
    { id: 'glass', name: '琉璃化', desc: '改为琉璃化：目标受到双倍物理伤害。', flag: 'glass' },
  ],
}

const thunderStrike: SpellDef = {
  id: 'thunder_strike', name: '雷击', level: 2, charges: 9,
  tags: ['sorcery', 'lightning'], icon: 'icon_thunder_strike', color: LIGHTNING,
  target: 'tile', requiresLOS: false,
  stats: { damage: 13, range: 10, duration: 1 },
  desc: s => `无需视线，可击中射程内任意格子。造成 `
    + `${s.st('damage')} 点闪电伤害并使目标眩晕 ${s.duration} 回合。`
    + (s.has('splash') ? '相邻敌人受到一半伤害。' : '')
    + (s.has('dig') ? '击碎目标格上的墙壁。' : ''),
  cast(s, g, x, y) {
    g.fx.strike(x, y, LIGHTNING)
    if (s.has('dig')) digWall(g, x, y)
    const dmg = s.st('damage')
    const target = g.level.unitAt(x, y)
    if (target && target.team !== 'player') {
      dealDamage(g, target, dmg, 'lightning', g.player, s)
      if (target.alive) inflict(g, target, 'stunned', s.duration)
    }
    if (!s.has('splash')) return
    g.fx.burst(x, y, 1.5, LIGHTNING)
    const half = Math.floor(dmg / 2)
    for (const u of unitsNear(g, x, y, 1.5, c => c.team === 'enemy')) {
      if (u === target) continue
      dealDamage(g, u, half, 'lightning', g.player, s)
    }
  },
  upgrades: [
    { id: 'over', name: '过载', desc: '伤害 +5。', mods: { damage: 5 } },
    { id: 'concuss', name: '震荡', desc: '眩晕持续 +1 回合。', mods: { duration: 1 } },
    { id: 'splash', name: '雷鸣', desc: '相邻敌人受到一半伤害。', flag: 'splash' },
    { id: 'dig', name: '崩裂', desc: '摧毁目标格上的墙壁。', flag: 'dig' },
  ],
}

const iceball: SpellDef = {
  id: 'iceball', name: '冰球', level: 2, charges: 8,
  tags: ['sorcery', 'ice'], icon: 'icon_iceball', color: ICE,
  target: 'tile',
  stats: { damage: 11, range: 8, radius: 2, duration: 1 },
  desc: s => `在半径 ${s.radius} 的球形范围内造成 ${s.st('damage')} 点冰霜伤害，并使`
    + `命中的一切冰冻 ${s.duration} 回合。`
    + (s.has('core') ? '中心格受到双倍伤害。' : '')
    + (s.has('linger') ? '原地留下一片持续 3 回合的暴风雪。' : ''),
  aoe: (s, g, x, y) => ballPoints(x, y, s.radius),
  cast(s, g, x, y) {
    const tiles = ballPoints(x, y, s.radius).filter(p => g.level.hasLOS(x, y, p.x, p.y))
    g.fx.bolt(g.player.x, g.player.y, x, y, ICE)
    g.fx.area(tiles, ICE)
    const dmg = s.st('damage')
    for (const p of tiles) {
      const u = g.level.unitAt(p.x, p.y)
      if (!u || u.team === 'player') continue
      const amount = s.has('core') && p.x === x && p.y === y ? dmg * 2 : dmg
      dealDamage(g, u, amount, 'ice', g.player, s)
      if (u.alive) inflict(g, u, 'frozen', s.duration)
    }
    if (!s.has('linger')) return
    for (const p of tiles) spawnCloud(g, 'blizzard', p.x, p.y, 3, Math.max(1, Math.floor(dmg / 2)), 'player')
  },
  upgrades: [
    { id: 'wide', name: '扩张球体', desc: '半径 +1。', mods: { radius: 1 } },
    { id: 'absolute', name: '绝对零度', desc: '伤害 +5。', mods: { damage: 5 } },
    { id: 'core', name: '冰封核心', desc: '中心格受到双倍伤害。', flag: 'core' },
    { id: 'linger', name: '残霜', desc: '留下一片不伤及己方的暴风雪。', flag: 'linger' },
  ],
}

const chainLightning: SpellDef = {
  id: 'chain_lightning', name: '连锁闪电', level: 3, charges: 4,
  tags: ['sorcery', 'lightning'], icon: 'icon_chain_lightning', color: LIGHTNING,
  target: 'enemy',
  stats: { damage: 16, range: 8, num_targets: 4, cascade_range: 4, duration: 3 },
  desc: s => `造成 ${s.st('damage')} 点闪电伤害，随后弧跳至 `
    + `${s.st('cascade_range')} 格内最近的敌人，最多累计命中 `
    + `${s.st('num_targets')} 个敌人。同一敌人绝不会被击中两次。`
    + (s.has('grow') ? '首跳之后，每一次弧跳伤害比上一次高 3 点。' : '')
    + (s.has('conduct') ? `每个被击中的敌人导电 ${s.duration} 回合。` : ''),
  cast(s, g, x, y) {
    const first = g.level.unitAt(x, y)
    if (!first) return
    const jumps = Math.max(1, s.st('num_targets'))
    const arc = s.st('cascade_range')
    const grow = s.has('grow') ? 3 : 0
    const visited = new Set<number>()
    let current: Unit | undefined = first
    let fromX = g.player.x, fromY = g.player.y
    let dmg = s.st('damage')

    while (current && visited.size < jumps) {
      visited.add(current.uid)
      g.fx.bolt(fromX, fromY, current.x, current.y, LIGHTNING)
      dealDamage(g, current, dmg, 'lightning', g.player, s)
      if (s.has('conduct') && current.alive) inflict(g, current, 'conductance', s.duration)
      fromX = current.x; fromY = current.y
      dmg += grow

      let next: Unit | undefined
      let bestD = Infinity
      for (const u of unitsNear(g, fromX, fromY, arc, c => c.team === 'enemy' && !visited.has(c.uid))) {
        if (!g.level.hasLOS(fromX, fromY, u.x, u.y)) continue
        const d = Math.hypot(u.x - fromX, u.y - fromY)
        if (d < bestD) { bestD = d; next = u }
      }
      current = next
    }
  },
  upgrades: [
    { id: 'cascade', name: '层叠', desc: '命中敌人数 +2。', mods: { num_targets: 2 } },
    { id: 'long_arc', name: '长弧', desc: '弧跳距离 +3。', mods: { cascade_range: 3 } },
    { id: 'grow', name: '增幅', desc: '每一次弧跳伤害比上一次高 3 点。', flag: 'grow' },
    { id: 'conduct', name: '电离化', desc: '被击中的敌人受到双倍闪电伤害。', flag: 'conduct' },
  ],
}

const iceVortex: SpellDef = {
  id: 'ice_vortex', name: '冰霜涡流', level: 4, charges: 6,
  tags: ['sorcery', 'ice'], icon: 'icon_ice_vortex', color: ICE,
  target: 'tile',
  stats: { damage: 18, range: 8, radius: 3, pull: 3, duration: 4 },
  desc: s => `将 ${s.radius} 格内的所有敌人朝目标点最多拖拽 ${s.st('pull')} 格，`
    + `随后对它们全部造成 ${s.st('damage')} 点冰霜伤害。`
    + (s.has('freeze') ? '被拖到中心的敌人冰冻 2 回合。' : '')
    + (s.has('cloud') ? `中心留下一片持续 ${s.duration} 回合的暴风雪。` : ''),
  aoe: (s, g, x, y) => ballPoints(x, y, s.radius),
  cast(s, g, x, y) {
    const r = s.radius
    g.fx.ring(x, y, r, ICE)
    for (const u of unitsNear(g, x, y, r, c => c.team === 'enemy')) {
      pullUnit(g, u, x, y, s.st('pull'))
    }
    const tiles = ballPoints(x, y, r).filter(p => g.level.hasLOS(x, y, p.x, p.y))
    g.fx.area(tiles, ICE)
    const dmg = s.st('damage')
    for (const p of tiles) {
      const u = g.level.unitAt(p.x, p.y)
      if (!u || u.team === 'player') continue
      dealDamage(g, u, dmg, 'ice', g.player, s)
      if (s.has('freeze') && u.alive && cheb(x, y, u.x, u.y) <= 1) inflict(g, u, 'frozen', 2)
    }
    if (s.has('cloud')) spawnCloud(g, 'blizzard', x, y, s.duration, 5, 'player')
  },
  upgrades: [
    { id: 'riptide', name: '暗涌', desc: '拖拽距离 +2。', mods: { pull: 2 } },
    { id: 'maw', name: '巨口', desc: '半径 +1。', mods: { radius: 1 } },
    { id: 'freeze', name: '冰封之心', desc: '冰冻被拖到中心的敌人。', flag: 'freeze' },
    { id: 'cloud', name: '白障', desc: '在中心留下一片暴风雪。', flag: 'cloud' },
  ],
}

const lightningStorm: SpellDef = {
  id: 'lightning_storm', name: '雷暴', level: 4, charges: 4,
  tags: ['sorcery', 'lightning'], icon: 'icon_lightning_storm', color: LIGHTNING,
  target: 'self', requiresLOS: false,
  stats: { damage: 20, num_targets: 4, duration: 4 },
  desc: s => `随机击中领域中任意 ${s.st('num_targets')} 个敌人，各造成 `
    + `${s.st('damage')} 点闪电伤害，墙壁与黑暗都挡不住。`
    + (s.has('deafen') ? '每个目标眩晕 1 回合。' : '')
    + (s.has('front') ? `每道落雷处留下一片持续 ${s.duration} 回合的雷云。` : ''),
  cast(s, g) {
    const foes = g.enemies
    if (foes.length === 0) {
      g.log('雷声在空荡的领域上滚过。', LIGHTNING)
      return
    }
    const dmg = s.st('damage')
    for (const u of g.rng.sample(foes, Math.max(1, s.st('num_targets')))) {
      g.fx.strike(u.x, u.y, LIGHTNING)
      if (s.has('front')) spawnCloud(g, 'storm', u.x, u.y, s.duration, 7, 'player')
      dealDamage(g, u, dmg, 'lightning', g.player, s)
      if (s.has('deafen') && u.alive) inflict(g, u, 'stunned', 1)
      g.fx.beat()
    }
  },
  upgrades: [
    { id: 'tempest', name: '狂澜', desc: '伤害 +6。', mods: { damage: 6 } },
    { id: 'downpour', name: '倾盆', desc: '目标数 +3。', mods: { num_targets: 3 } },
    { id: 'deafen', name: '震耳', desc: '每个目标眩晕 1 回合。', flag: 'deafen' },
    { id: 'front', name: '风暴前锋', desc: '每道落雷处留下一片雷云。', flag: 'front' },
  ],
}

const blizzard: SpellDef = {
  id: 'blizzard', name: '暴风雪', level: 4, charges: 4,
  tags: ['sorcery', 'ice'], icon: 'icon_blizzard', color: ICE,
  target: 'tile',
  stats: { damage: 6, range: 9, radius: 3, duration: 6 },
  desc: s => `以半径 ${s.radius} 的范围降下暴风雪，持续 ${s.duration} 回合。`
    + `任何在其中结束回合的单位受到 ${s.st('damage')} 点冰霜伤害，并可能被冰冻。`
    + (s.has('safe') ? '绝不伤及自身与随从。' : ''),
  aoe: (s, g, x, y) => ballPoints(x, y, s.radius),
  cast(s, g, x, y) {
    const tiles = ballPoints(x, y, s.radius).filter(p => g.level.hasLOS(x, y, p.x, p.y))
    g.fx.area(tiles, ICE)
    const dur = s.duration
    const power = s.st('damage')
    const spared: 'player' | undefined = s.has('safe') ? 'player' : undefined
    for (const p of tiles) spawnCloud(g, 'blizzard', p.x, p.y, dur, power, spared)
  },
  upgrades: [
    { id: 'deepening', name: '愈演愈烈', desc: '半径 +1。', mods: { radius: 1 } },
    { id: 'winter', name: '无尽寒冬', desc: '持续 +4 回合。', mods: { duration: 4 } },
    { id: 'killing', name: '致命严寒', desc: '每回合伤害 +3。', mods: { damage: 3 } },
    { id: 'safe', name: '庇护', desc: '暴风雪不伤及自身与随从。', flag: 'safe' },
  ],
}

const stormBurst: SpellDef = {
  id: 'storm_burst', name: '风暴爆冲', level: 4, charges: 4,
  tags: ['sorcery', 'lightning', 'translocation'], icon: 'icon_storm_burst', color: LIGHTNING,
  target: 'empty',
  stats: { damage: 20, range: 9, radius: 3 },
  // 'empty' allows chasms for flyers; the wizard walks, so demand solid ground
  canTarget: (s, g, x, y) => g.level.passable(x, y, g.player.flying),
  desc: s => `在自身周围半径 ${s.radius} 的范围内释放 ${s.st('damage')} 点`
    + '闪电伤害，随后闪现至目标格。'
    + (s.has('twice') ? '落地时再爆发一次。' : '')
    + (s.has('shell') ? '被波及的敌人眩晕 1 回合。' : ''),
  aoe: (s, g, x, y) => {
    const pts = ballPoints(g.player.x, g.player.y, s.radius)
    if (s.has('twice')) for (const p of ballPoints(x, y, s.radius)) pts.push(p)
    else pts.push({ x, y })
    return pts
  },
  cast(s, g, x, y) {
    const dmg = s.st('damage')
    const r = s.radius
    const discharge = (cx: number, cy: number): void => {
      const tiles = ballPoints(cx, cy, r).filter(p => g.level.hasLOS(cx, cy, p.x, p.y))
      g.fx.burst(cx, cy, r, LIGHTNING)
      g.fx.area(tiles, LIGHTNING)
      for (const p of tiles) {
        const u = g.level.unitAt(p.x, p.y)
        if (!u || u.team === 'player') continue
        dealDamage(g, u, dmg, 'lightning', g.player, s)
        if (s.has('shell') && u.alive) inflict(g, u, 'stunned', 1)
      }
    }
    discharge(g.player.x, g.player.y)
    teleportUnit(g, g.player, x, y)
    if (!s.has('twice')) return
    g.fx.beat()
    discharge(g.player.x, g.player.y)
  },
  upgrades: [
    { id: 'wider', name: '扩张爆冲', desc: '半径 +1。', mods: { radius: 1 } },
    { id: 'thunderhead', name: '雷云顶', desc: '伤害 +6。', mods: { damage: 6 } },
    { id: 'twice', name: '双重放电', desc: '落地处再爆发一次。', flag: 'twice' },
    { id: 'shell', name: '雷震休克', desc: '被爆冲波及的敌人眩晕。', flag: 'shell' },
  ],
}

const ballLightning: SpellDef = {
  id: 'ball_lightning', name: '球状闪电', level: 5, charges: 4,
  tags: ['sorcery', 'orb', 'lightning'], icon: 'icon_ball_lightning', color: LIGHTNING,
  target: 'empty',
  stats: {
    range: 7, radius: 2,
    minion_health: ORB_HP, minion_damage: ORB_DAMAGE, minion_duration: 8,
  },
  desc: s => `召唤一个 ${s.st('minion_health')} 点生命的风暴法球，持续 `
    + `${s.st('minion_duration')} 回合。它会朝敌人飘移，每回合在半径 ${s.radius} 的`
    + `范围内放出 ${s.st('minion_damage')} 点闪电伤害。`
    + (s.has('throes') ? '死亡或到期时以双倍伤害爆开。' : ''),
  cast(s, g, x, y) {
    const duration = Math.max(1, s.st('minion_duration'))
    const orb = summonUnit(g, 'orb_lightning', x, y, {
      team: 'player', duration, summoner: g.player,
      hpBonus: s.st('minion_health') - ORB_HP,
      damageBonus: s.st('minion_damage') - ORB_DAMAGE,
    })
    if (!orb) return
    const radius = s.radius
    for (const a of orb.attacks) a.radius = radius

    if (!s.has('throes')) return
    const blast = (orb.attacks[0]?.damage ?? ORB_DAMAGE) * 2
    let fired = false
    const detonate = (u: Unit, game: Game): void => {
      if (fired) return
      fired = true
      game.fx.burst(u.x, u.y, radius, LIGHTNING)
      for (const t of unitsNear(game, u.x, u.y, radius, c => c.team === 'enemy')) {
        dealDamage(game, t, blast, 'lightning', game.player, s)
      }
    }
    applyBuff(g, orb, {
      id: 'orb_throes', name: '濒死爆裂', kind: 'buff', duration, color: LIGHTNING,
      desc: `消失时在半径 ${radius} 范围内造成 ${blast} 点闪电伤害。`,
      onDeath: detonate,
      onExpire: detonate,
    })
  },
  upgrades: [
    { id: 'greater', name: '强化法球', desc: '法球生命 +15。', mods: { minion_health: 15 } },
    { id: 'wide', name: '广域放电', desc: '爆发半径 +1。', mods: { radius: 1 } },
    { id: 'persist', name: '持存', desc: '法球持续 +5 回合。', mods: { minion_duration: 5 } },
    { id: 'throes', name: '濒死爆裂', desc: '法球消失时以双倍伤害爆开。', flag: 'throes' },
  ],
}

const conductance: SpellDef = {
  id: 'conductance', name: '导电术', level: 4, charges: 12,
  tags: ['enchantment', 'lightning'], icon: 'icon_conductance', color: LIGHTNING,
  target: 'tile',
  stats: { range: 8, radius: 3, duration: 8 },
  desc: s => `使目标点 ${s.radius} 格内的所有敌人导电 ${s.duration} 回合：`
    + '它们受到双倍闪电伤害。'
    + (s.has('ground') ? '任何闪电命中还会使其眩晕 1 回合。' : '')
    + (s.has('melt') ? '它们同时额外承受物理、火焰与冰霜伤害。' : ''),
  aoe: (s, g, x, y) => ballPoints(x, y, s.radius),
  cast(s, g, x, y) {
    const tiles = ballPoints(x, y, s.radius).filter(p => g.level.hasLOS(x, y, p.x, p.y))
    g.fx.area(tiles, LIGHTNING)
    const dur = s.duration
    let marked = 0
    for (const p of tiles) {
      const u = g.level.unitAt(p.x, p.y)
      if (!u || u.team === 'player') continue
      marked++
      // replace outright so an upgraded cast overwrites a plain mark
      removeBuff(g, u, 'conductance')
      const b = s.has('ground') ? groundedConductance(dur) : makeBuff('conductance', dur)
      if (b) applyBuff(g, u, b)
      if (s.has('melt')) inflict(g, u, 'melted', dur)
    }
    if (marked === 0) g.log('电荷找不到可以接地的东西。', LIGHTNING)
  },
  upgrades: [
    { id: 'broad', name: '广域充能', desc: '半径 +2。', mods: { radius: 2 } },
    { id: 'lasting', name: '持久充能', desc: '持续 +5 回合。', mods: { duration: 5 } },
    { id: 'ground', name: '接地棒', desc: '闪电命中导电敌人时使其眩晕。', flag: 'ground' },
    { id: 'melt', name: '过热', desc: '导电敌人还额外承受物理、火焰与冰霜伤害。', flag: 'melt' },
  ],
}

export const spells: SpellDef[] = [
  icicle, lightningBolt, freeze, thunderStrike, iceball, chainLightning,
  iceVortex, lightningStorm, blizzard, stormBurst, ballLightning, conductance,
]

// ----------------------------------------------------------------------- units

const orbLightning: UnitDef = {
  id: 'orb_lightning', name: '球状闪电', sprite: 'mon_orb_lightning',
  color: LIGHTNING,
  maxHP: ORB_HP, level: 5, team: 'player', flying: true,
  tags: ['elemental', 'arcane'],
  resists: { lightning: 100, physical: 50, ice: -50 },
  attacks: [{
    kind: 'burst', name: '放电', damage: ORB_DAMAGE, damageType: 'lightning',
    radius: 2, color: LIGHTNING,
  }],
  description: '一团松散的风暴。它飘向最近的东西，然后一泄而空。',
}

export const units: UnitDef[] = [orbLightning]

// --------------------------------------------------------------------- sprites

export const sprites: Record<string, SpriteDef> = {
  icon_icicle: {
    palette: [ICE, '#12354d', '#e8fbff'],
    shapes: [
      { t: 'poly', pts: [0.5, 0.95, 0.35, 0.32, 0.5, 0.08, 0.65, 0.32], fill: '$1', stroke: '$0', w: 0.045 },
      { t: 'line', pts: [0.46, 0.2, 0.44, 0.72], stroke: '$2', w: 0.03 },
      { t: 'line', pts: [0.19, 0.28, 0.32, 0.44], stroke: '$0', w: 0.035 },
      { t: 'line', pts: [0.68, 0.52, 0.82, 0.66], stroke: '$0', w: 0.035 },
      { t: 'circle', x: 0.5, y: 0.14, r: 0.035, fill: '$2' },
    ],
  },

  icon_lightning_bolt: {
    palette: [LIGHTNING, '#3a2e08', '#fff8c0'],
    shapes: [
      { t: 'poly', pts: [0.6, 0.05, 0.31, 0.52, 0.48, 0.52, 0.37, 0.95, 0.73, 0.44, 0.55, 0.44, 0.69, 0.05], fill: '$1', stroke: '$0', w: 0.05 },
      { t: 'line', pts: [0.56, 0.14, 0.42, 0.5], stroke: '$2', w: 0.03 },
      { t: 'line', pts: [0.52, 0.57, 0.43, 0.86], stroke: '$2', w: 0.025 },
      { t: 'circle', x: 0.645, y: 0.08, r: 0.04, fill: '$0' },
      { t: 'circle', x: 0.16, y: 0.3, r: 0.03, fill: '$0' },
      { t: 'circle', x: 0.86, y: 0.7, r: 0.03, fill: '$0' },
    ],
  },

  icon_freeze: {
    palette: [ICE, '#12354d', '#e8fbff'],
    shapes: [
      { t: 'circle', x: 0.5, y: 0.52, r: 0.3, fill: '$1', stroke: '$0', w: 0.045 },
      { t: 'line', pts: [0.5, 0.14, 0.5, 0.9], stroke: '$0', w: 0.045 },
      { t: 'line', pts: [0.23, 0.31, 0.77, 0.73], stroke: '$0', w: 0.04 },
      { t: 'line', pts: [0.77, 0.31, 0.23, 0.73], stroke: '$0', w: 0.04 },
      { t: 'circle', x: 0.5, y: 0.52, r: 0.08, fill: '$2' },
      { t: 'arc', x: 0.5, y: 0.52, r: 0.37, a0: -2.6, a1: -0.6, stroke: '$2', w: 0.03 },
    ],
  },

  icon_thunder_strike: {
    palette: [LIGHTNING, '#3a2e08', '#fff8c0'],
    shapes: [
      { t: 'blob', x: 0.5, y: 0.22, r: 0.23, lobes: 6, fill: '$1', stroke: '$0', w: 0.04 },
      { t: 'poly', pts: [0.46, 0.4, 0.33, 0.66, 0.5, 0.64, 0.41, 0.9, 0.67, 0.57, 0.5, 0.57, 0.6, 0.4], fill: '$2', stroke: '$0', w: 0.035 },
      { t: 'line', pts: [0.14, 0.92, 0.86, 0.92], stroke: '$0', w: 0.045 },
      { t: 'circle', x: 0.42, y: 0.91, r: 0.07, fill: '$0' },
      { t: 'line', pts: [0.23, 0.82, 0.29, 0.91], stroke: '$2', w: 0.025 },
      { t: 'line', pts: [0.72, 0.82, 0.63, 0.91], stroke: '$2', w: 0.025 },
    ],
  },

  icon_iceball: {
    palette: [ICE, '#12354d', '#e8fbff'],
    shapes: [
      { t: 'blob', x: 0.5, y: 0.54, r: 0.3, lobes: 7, fill: '$1', stroke: '$0', w: 0.05 },
      { t: 'poly', pts: [0.5, 0.12, 0.4, 0.44, 0.61, 0.44], fill: '$0', stroke: '$2', w: 0.025 },
      { t: 'poly', pts: [0.11, 0.6, 0.42, 0.5, 0.39, 0.72], fill: '$0', stroke: '$2', w: 0.025 },
      { t: 'poly', pts: [0.89, 0.44, 0.59, 0.55, 0.67, 0.73], fill: '$0', stroke: '$2', w: 0.025 },
      { t: 'circle', x: 0.5, y: 0.56, r: 0.1, fill: '$2' },
      { t: 'arc', x: 0.5, y: 0.54, r: 0.2, a0: 2.4, a1: 4.2, stroke: '$2', w: 0.028 },
    ],
  },

  icon_chain_lightning: {
    palette: [LIGHTNING, '#3a2e08', '#fff8c0', '#8a6a10'],
    shapes: [
      { t: 'line', pts: [0.08, 0.16, 0.36, 0.42, 0.2, 0.56, 0.5, 0.8], stroke: '$3', w: 0.11 },
      { t: 'line', pts: [0.36, 0.42, 0.64, 0.28, 0.52, 0.46, 0.9, 0.34], stroke: '$3', w: 0.1 },
      { t: 'line', pts: [0.08, 0.16, 0.36, 0.42, 0.2, 0.56, 0.5, 0.8], stroke: '$0', w: 0.055 },
      { t: 'line', pts: [0.36, 0.42, 0.64, 0.28, 0.52, 0.46, 0.9, 0.34], stroke: '$0', w: 0.045 },
      { t: 'circle', x: 0.36, y: 0.42, r: 0.09, fill: '$1', stroke: '$0', w: 0.035 },
      { t: 'circle', x: 0.36, y: 0.42, r: 0.035, fill: '$2' },
      { t: 'circle', x: 0.9, y: 0.34, r: 0.05, fill: '$2' },
      { t: 'circle', x: 0.5, y: 0.8, r: 0.05, fill: '$2' },
    ],
  },

  icon_ice_vortex: {
    palette: [ICE, '#12354d', '#e8fbff'],
    shapes: [
      { t: 'circle', x: 0.5, y: 0.52, r: 0.36, fill: '$1', stroke: '$0', w: 0.045 },
      { t: 'arc', x: 0.5, y: 0.52, r: 0.28, a0: 0, a1: 3.6, stroke: '$0', w: 0.045 },
      { t: 'arc', x: 0.5, y: 0.52, r: 0.18, a0: 2.2, a1: 5.6, stroke: '$2', w: 0.04 },
      { t: 'arc', x: 0.5, y: 0.52, r: 0.09, a0: 4.2, a1: 7.0, stroke: '$0', w: 0.035 },
      { t: 'poly', pts: [0.9, 0.16, 0.7, 0.28, 0.81, 0.36], fill: '$2', stroke: '$0', w: 0.02 },
      { t: 'poly', pts: [0.1, 0.88, 0.3, 0.76, 0.19, 0.68], fill: '$2', stroke: '$0', w: 0.02 },
      { t: 'circle', x: 0.5, y: 0.52, r: 0.05, fill: '$2' },
    ],
  },

  icon_lightning_storm: {
    palette: [LIGHTNING, '#3a2e08', '#fff8c0'],
    shapes: [
      { t: 'ellipse', x: 0.5, y: 0.24, rx: 0.44, ry: 0.18, fill: '$1', stroke: '$0', w: 0.045 },
      { t: 'line', pts: [0.2, 0.42, 0.14, 0.62, 0.25, 0.58, 0.16, 0.9], stroke: '$0', w: 0.04 },
      { t: 'line', pts: [0.44, 0.44, 0.38, 0.66, 0.5, 0.62, 0.41, 0.96], stroke: '$2', w: 0.04 },
      { t: 'line', pts: [0.68, 0.42, 0.62, 0.6, 0.74, 0.56, 0.66, 0.88], stroke: '$0', w: 0.04 },
      { t: 'line', pts: [0.86, 0.44, 0.9, 0.66], stroke: '$0', w: 0.032 },
      { t: 'line', pts: [0.1, 0.24, 0.9, 0.24], stroke: '$2', w: 0.028 },
    ],
  },

  icon_blizzard: {
    palette: [ICE, '#12354d', '#e8fbff'],
    shapes: [
      { t: 'blob', x: 0.48, y: 0.25, r: 0.3, lobes: 7, fill: '$1', stroke: '$0', w: 0.045 },
      { t: 'line', pts: [0.18, 0.5, 0.31, 0.75], stroke: '$0', w: 0.035 },
      { t: 'line', pts: [0.44, 0.52, 0.57, 0.79], stroke: '$2', w: 0.035 },
      { t: 'line', pts: [0.69, 0.49, 0.81, 0.72], stroke: '$0', w: 0.035 },
      { t: 'circle', x: 0.25, y: 0.88, r: 0.05, fill: '$2' },
      { t: 'circle', x: 0.58, y: 0.92, r: 0.04, fill: '$0' },
      { t: 'circle', x: 0.83, y: 0.85, r: 0.035, fill: '$2' },
    ],
  },

  icon_storm_burst: {
    palette: [LIGHTNING, '#3a2e08', '#8affea'],
    shapes: [
      { t: 'circle', x: 0.5, y: 0.52, r: 0.2, fill: '$1', stroke: '$2', w: 0.04 },
      { t: 'arc', x: 0.5, y: 0.52, r: 0.38, a0: -2.9, a1: 0.3, stroke: '$0', w: 0.05 },
      { t: 'arc', x: 0.5, y: 0.52, r: 0.38, a0: 0.7, a1: 3.5, stroke: '$0', w: 0.05 },
      { t: 'line', pts: [0.5, 0.3, 0.5, 0.06], stroke: '$0', w: 0.035 },
      { t: 'line', pts: [0.68, 0.64, 0.9, 0.76], stroke: '$0', w: 0.035 },
      { t: 'line', pts: [0.32, 0.64, 0.1, 0.76], stroke: '$0', w: 0.035 },
      { t: 'circle', x: 0.5, y: 0.52, r: 0.07, fill: '$2' },
    ],
  },

  icon_ball_lightning: {
    palette: [LIGHTNING, '#3a2e08', '#fff8c0', '#8a6a10'],
    shapes: [
      { t: 'circle', x: 0.5, y: 0.52, r: 0.33, fill: '$1', stroke: '$0', w: 0.055 },
      { t: 'line', pts: [0.42, 0.32, 0.57, 0.5, 0.42, 0.56, 0.58, 0.74], stroke: '$3', w: 0.1 },
      { t: 'line', pts: [0.42, 0.32, 0.57, 0.5, 0.42, 0.56, 0.58, 0.74], stroke: '$0', w: 0.045 },
      { t: 'arc', x: 0.5, y: 0.52, r: 0.22, a0: 3.5, a1: 5.2, stroke: '$2', w: 0.03 },
      { t: 'line', pts: [0.5, 0.19, 0.5, 0.04], stroke: '$0', w: 0.032 },
      { t: 'line', pts: [0.8, 0.36, 0.94, 0.26], stroke: '$0', w: 0.032 },
      { t: 'line', pts: [0.25, 0.74, 0.1, 0.86], stroke: '$0', w: 0.032 },
      { t: 'line', pts: [0.2, 0.4, 0.06, 0.32], stroke: '$0', w: 0.028 },
    ],
  },

  icon_conductance: {
    palette: [LIGHTNING, '#3a2e08', '#fff8c0'],
    shapes: [
      { t: 'circle', x: 0.5, y: 0.54, r: 0.34, fill: '$1', stroke: '$0', w: 0.045 },
      { t: 'arc', x: 0.5, y: 0.54, r: 0.43, a0: 2.2, a1: 4.1, stroke: '$2', w: 0.035 },
      { t: 'arc', x: 0.5, y: 0.54, r: 0.43, a0: -0.95, a1: 0.95, stroke: '$2', w: 0.035 },
      { t: 'poly', pts: [0.56, 0.27, 0.39, 0.55, 0.52, 0.55, 0.43, 0.81, 0.63, 0.5, 0.5, 0.5, 0.61, 0.27], fill: '$0', stroke: '$2', w: 0.025 },
      { t: 'circle', x: 0.5, y: 0.18, r: 0.045, fill: '$0' },
    ],
  },

  mon_orb_lightning: {
    palette: [LIGHTNING, '#3a2e08', '#fff8c0', '#241c04'],
    wobble: 0.8,
    shapes: [
      { t: 'circle', x: 0.5, y: 0.5, r: 0.38, fill: '$3' },
      { t: 'arc', x: 0.5, y: 0.5, r: 0.38, a0: -2.4, a1: 0.5, stroke: '$0', w: 0.03 },
      { t: 'arc', x: 0.5, y: 0.5, r: 0.38, a0: 0.9, a1: 3.4, stroke: '$0', w: 0.03 },
      { t: 'circle', x: 0.5, y: 0.5, r: 0.23, fill: '$1', stroke: '$0', w: 0.055 },
      { t: 'ellipse', x: 0.5, y: 0.48, rx: 0.15, ry: 0.1, fill: '$2', stroke: '$0', w: 0.028 },
      { t: 'ellipse', x: 0.5, y: 0.48, rx: 0.045, ry: 0.075, fill: '#101018' },
      { t: 'line', pts: [0.28, 0.2, 0.4, 0.34], stroke: '$0', w: 0.035 },
      { t: 'line', pts: [0.74, 0.24, 0.62, 0.36], stroke: '$0', w: 0.035 },
      { t: 'line', pts: [0.5, 0.82, 0.5, 0.66], stroke: '$0', w: 0.035 },
    ],
  },
}
