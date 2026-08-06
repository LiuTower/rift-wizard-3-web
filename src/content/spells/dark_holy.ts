import type { SpellDef, SpellInst } from '../../core/spell'
import type { Buff, Unit, UnitDef } from '../../core/unit'
import type { Game } from '../../core/game'
import type { DamageType, Point } from '../../core/types'
import type { SpriteDef } from '../../render/sprite'
import { Tile } from '../../core/types'
import { ballPoints, cheb, line as rayLine, ringPoints } from '../../core/geom'
import { applyBuff, cleanse, dealDamage, digWall, healUnit, summonUnit, unitsNear } from '../../core/combat'
import { makeBuff } from '../../core/buffs'

const DARK = '#a05ad0'
const HOLY = '#fff5b0'
const BLOOD = '#d02b3a'
const ICE = '#7fd8ff'
const VOID = '#ff5cc8'
const LIFE = '#9affc0'

const ANGEL_HP = 30
const ANGEL_DAMAGE = 8

/** Apply a registry buff without asserting the lookup succeeded. */
function put(g: Game, u: Unit, id: string, duration: number, power?: number): void {
  const b = makeBuff(id, duration, power)
  if (b) applyBuff(g, u, b)
}

// --------------------------------------------------------------- 1. death bolt

const deathBolt: SpellDef = {
  id: 'death_bolt', name: '死亡箭', level: 1, charges: 15,
  tags: ['sorcery', 'dark'], icon: 'icon_death_bolt', color: DARK,
  target: 'enemy',
  stats: { damage: 9, range: 8, duration: 5 },
  desc(s) {
    const out = [`对单个敌人造成 ${s.st('damage')} 点黑暗伤害。`]
    if (s.has('soulmark')) out.push(`目标死亡时爆发，在半径 2 范围内造成 ${Math.floor(s.st('damage') / 2)} 点黑暗伤害。`)
    if (s.has('curse')) out.push(`存活者被诅咒 ${s.duration} 回合。`)
    return out.join('')
  },
  cast(s, g, x, y) {
    const u = g.level.unitAt(x, y)
    if (!u) return
    g.fx.bolt(g.player.x, g.player.y, x, y, DARK)
    // marked before the hit so a lethal bolt still detonates
    if (s.has('soulmark')) put(g, u, 'soul_marked', s.duration, Math.floor(s.st('damage') / 2))
    dealDamage(g, u, s.st('damage'), 'dark', g.player, s)
    if (s.has('curse') && u.alive) put(g, u, 'cursed', s.duration)
  },
  upgrades: [
    { id: 'reach', name: '黑暗延伸', desc: '射程 +3。', mods: { range: 3 } },
    { id: 'wither', name: '枯萎', desc: '伤害 +4。', mods: { damage: 4 } },
    { id: 'soulmark', name: '灵魂印记', desc: '目标被打上灵魂印记，死亡时引爆。', flag: 'soulmark' },
    { id: 'curse', name: '邪咒', desc: '存活者受到的黑暗与神圣伤害提高 50%。', flag: 'curse' },
  ],
}

// ---------------------------------------------------------------- 2. lifedrain

const lifedrain: SpellDef = {
  id: 'lifedrain', name: '吸取生命', level: 1, charges: 20,
  tags: ['sorcery', 'dark', 'blood'], icon: 'icon_lifedrain', color: BLOOD,
  target: 'enemy',
  stats: { damage: 6, range: 6 },
  desc(s) {
    const out = [`造成 ${s.st('damage')} 点黑暗伤害，并按造成伤害的${s.has('greater') ? '两倍' : '数值'}治疗自身。`]
    out.push('治疗量不会超过自身最大生命值。')
    if (s.has('feast')) out.push('击杀目标返还 1 点充能。')
    return out.join('')
  },
  cast(s, g, x, y) {
    const u = g.level.unitAt(x, y)
    if (!u) return
    g.fx.bolt(g.player.x, g.player.y, x, y, BLOOD)
    const dealt = dealDamage(g, u, s.st('damage'), 'dark', g.player, s)
    if (dealt > 0) {
      g.fx.bolt(x, y, g.player.x, g.player.y, LIFE)
      healUnit(g, g.player, dealt * (s.has('greater') ? 2 : 1))
    }
    if (s.has('feast') && !u.alive) s.charges = Math.min(s.maxCharges, s.charges + 1)
  },
  upgrades: [
    { id: 'gorge', name: '饕餮', desc: '伤害 +3。', mods: { damage: 3 } },
    { id: 'reach', name: '远汲', desc: '射程 +4。', mods: { range: 4 } },
    { id: 'greater', name: '吸血', desc: '按造成伤害的两倍治疗自身。', flag: 'greater' },
    { id: 'feast', name: '灵魂盛宴', desc: '击杀目标返还 1 点充能。', flag: 'feast' },
  ],
}

// ----------------------------------------------------------- 3. heavenly blast

const heavenlyBlast: SpellDef = {
  id: 'heavenly_blast', name: '天罚', level: 2, charges: 12,
  tags: ['sorcery', 'holy'], icon: 'icon_heavenly_blast', color: HOLY,
  target: 'enemy',
  stats: { damage: 12, range: 8, radius: 1, heal: 5, duration: 4 },
  desc(s) {
    const out = [`在半径 ${s.radius} 的溅射范围内造成 ${s.st('damage')} 点神圣伤害。`]
    out.push(`范围内的友军改为回复 ${s.st('heal')} 点生命。`)
    if (s.has('aegis')) out.push('这些友军还会获得护盾。')
    return out.join('')
  },
  aoe: (s, g, x, y) => ballPoints(x, y, s.radius),
  cast(s, g, x, y) {
    const tiles = ballPoints(x, y, s.radius).filter(p => g.level.hasLOS(x, y, p.x, p.y))
    g.fx.bolt(g.player.x, g.player.y, x, y, HOLY)
    g.fx.area(tiles, HOLY)
    for (const p of tiles) {
      const u = g.level.unitAt(p.x, p.y)
      if (!u) continue
      if (u.team === 'player') {
        healUnit(g, u, s.st('heal'))
        if (s.has('aegis')) put(g, u, 'shielded', s.duration, 1)
      } else {
        dealDamage(g, u, s.st('damage'), 'holy', g.player, s)
      }
    }
  },
  upgrades: [
    { id: 'radiance', name: '辉光', desc: '半径 +1。', mods: { radius: 1 } },
    { id: 'zeal', name: '狂信', desc: '伤害 +4。', mods: { damage: 4 } },
    { id: 'mercy', name: '慈悯', desc: '治疗量 +5。', mods: { heal: 5 } },
    { id: 'aegis', name: '圣盾', desc: '受到治疗的友军获得护盾。', flag: 'aegis' },
  ],
}

// ----------------------------------------------------------- 4. healing light

const healingLight: SpellDef = {
  id: 'healing_light', name: '治愈之光', level: 2, charges: 10,
  tags: ['enchantment', 'holy'], icon: 'icon_healing_light', color: LIFE,
  target: 'self',
  stats: { heal: 14, radius: 4, duration: 6, regen: 3 },
  desc(s) {
    const out = [`为自身及 ${s.radius} 格内的所有友军回复 ${s.st('heal')} 点生命。`]
    if (s.has('purity')) out.push('并移除它们身上的负面效果。')
    if (s.has('lasting')) out.push(`它们在 ${s.duration} 回合内每回合再生 ${s.st('regen')} 点生命。`)
    return out.join('')
  },
  aoe: (s, g, x, y) => ballPoints(x, y, s.radius),
  cast(s, g, x, y) {
    g.fx.burst(x, y, s.radius, LIFE)
    for (const u of unitsNear(g, x, y, s.radius, t => t.team === 'player')) {
      healUnit(g, u, s.st('heal'))
      if (s.has('purity')) cleanse(g, u)
      if (s.has('lasting')) put(g, u, 'regen', s.duration, s.st('regen'))
    }
  },
  upgrades: [
    { id: 'mend', name: '强效愈合', desc: '治疗量 +8。', mods: { heal: 8 } },
    { id: 'wide', name: '广恩', desc: '半径 +3。', mods: { radius: 3 } },
    { id: 'purity', name: '净化', desc: '同时清除负面效果。', flag: 'purity' },
    { id: 'lasting', name: '长明之光', desc: '额外赋予再生。', flag: 'lasting' },
  ],
}

// ---------------------------------------------------------- 5. touch of death

const touchOfDeath: SpellDef = {
  id: 'touch_of_death', name: '死亡之触', level: 2, charges: 9,
  tags: ['sorcery', 'dark'], icon: 'icon_touch_of_death', color: DARK,
  target: 'enemy',
  stats: { damage: 40, range: 1, duration: 5 },
  desc(s) {
    const r = s.range
    const out = [`触碰 ${r} 格内的一个生物，造成 ${s.st('damage')} 点黑暗伤害。`]
    if (s.has('reap')) out.push('击杀目标返还 1 点充能。')
    if (s.has('necrosis')) out.push(`存活者被诅咒 ${s.duration} 回合。`)
    return out.join('')
  },
  cast(s, g, x, y) {
    const u = g.level.unitAt(x, y)
    if (!u) return
    g.fx.strike(x, y, DARK)
    g.fx.flash(x, y, DARK)
    dealDamage(g, u, s.st('damage'), 'dark', g.player, s)
    if (!u.alive) {
      if (s.has('reap')) s.charges = Math.min(s.maxCharges, s.charges + 1)
    } else if (s.has('necrosis')) {
      put(g, u, 'cursed', s.duration)
    }
  },
  upgrades: [
    { id: 'grip', name: '墓穴之握', desc: '伤害 +14。', mods: { damage: 14 } },
    { id: 'reach', name: '延伸之手', desc: '射程 +1。', mods: { range: 1 } },
    { id: 'reap', name: '收割', desc: '击杀目标返还 1 点充能。', flag: 'reap' },
    { id: 'necrosis', name: '坏死', desc: '存活者受到的黑暗与神圣伤害提高 50%。', flag: 'necrosis' },
  ],
}

// -------------------------------------------------------------- 6. death chill

/** Escalating mark: every new Death Chill adds ice damage for each stack. */
function chillMark(duration: number, power: number): Buff {
  return {
    id: 'death_chill', name: '死寂寒意', kind: 'debuff', duration,
    stacks: 1, stacking: 'stack', color: ICE,
    desc: `下一次死寂寒意每层额外造成 ${power} 点冰霜伤害。`,
  }
}

const deathChill: SpellDef = {
  id: 'death_chill', name: '死寂寒意', level: 3, charges: 12,
  tags: ['sorcery', 'dark', 'ice'], icon: 'icon_death_chill', color: DARK,
  target: 'enemy',
  stats: { damage: 15, range: 7, chill: 4, duration: 8 },
  desc(s) {
    const out = [`造成 ${s.st('damage')} 点黑暗伤害，并按目标身上已有的每层死寂寒意追加 ${s.st('chill')} 点冰霜伤害。`]
    out.push(`随后叠加 1 层，持续 ${s.duration} 回合。`)
    if (s.has('frostbite')) out.push('目标层数达到 3 层及以上时冰冻 1 回合。')
    return out.join('')
  },
  cast(s, g, x, y) {
    const u = g.level.unitAt(x, y)
    if (!u) return
    const stacks = u.buffOf('death_chill')?.stacks ?? 0
    g.fx.bolt(g.player.x, g.player.y, x, y, DARK)
    dealDamage(g, u, s.st('damage'), 'dark', g.player, s)
    if (stacks > 0 && u.alive) {
      g.fx.flash(x, y, ICE)
      dealDamage(g, u, s.st('chill') * stacks, 'ice', g.player, s)
    }
    if (!u.alive) return
    applyBuff(g, u, chillMark(s.duration, s.st('chill')))
    if (s.has('frostbite') && (u.buffOf('death_chill')?.stacks ?? 1) >= 3) put(g, u, 'frozen', 1)
  },
  upgrades: [
    { id: 'deep', name: '深寒', desc: '每层冰霜伤害 +3。', mods: { chill: 3 } },
    { id: 'wither', name: '枯萎', desc: '黑暗伤害 +5。', mods: { damage: 5 } },
    { id: 'linger', name: '余寒', desc: '层数持续 +6 回合。', mods: { duration: 6 } },
    { id: 'frostbite', name: '冻伤', desc: '目标层数达到 3 层及以上时冰冻 1 回合。', flag: 'frostbite' },
  ],
}

// ---------------------------------------------------------------- 7. holy fire

const holyFire: SpellDef = {
  id: 'holy_fire', name: '圣焰', level: 3, charges: 7,
  tags: ['sorcery', 'holy', 'fire'], icon: 'icon_holy_fire', color: HOLY,
  target: 'tile',
  stats: { damage: 14, range: 7, radius: 2, burn: 3 },
  desc(s) {
    const out = [`在半径 ${s.radius} 的球形范围内灼烧，造成 ${s.st('damage')} 点神圣伤害。`]
    out.push('亡灵与恶魔受到双倍伤害。')
    if (s.has('ignite')) out.push(`存活者燃烧 ${s.st('burn')} 回合。`)
    return out.join('')
  },
  aoe: (s, g, x, y) => ballPoints(x, y, s.radius),
  cast(s, g, x, y) {
    const tiles = ballPoints(x, y, s.radius).filter(p => g.level.hasLOS(x, y, p.x, p.y))
    g.fx.area(tiles, HOLY)
    g.fx.burst(x, y, s.radius, '#ffd84a')
    for (const p of tiles) {
      const u = g.level.unitAt(p.x, p.y)
      if (!u || u === g.player) continue
      const unholy = u.hasTag('undead') || u.hasTag('demon')
      dealDamage(g, u, s.st('damage') * (unholy ? 2 : 1), 'holy', g.player, s)
      if (s.has('ignite') && u.alive) put(g, u, 'burning', s.st('burn'), 3)
    }
  },
  upgrades: [
    { id: 'wide', name: '广焰', desc: '半径 +1。', mods: { radius: 1 } },
    { id: 'zeal', name: '狂信之火', desc: '伤害 +5。', mods: { damage: 5 } },
    { id: 'far', name: '远光', desc: '射程 +3。', mods: { range: 3 } },
    { id: 'ignite', name: '圣化', desc: '存活者被点燃。', flag: 'ignite' },
  ],
}

// ----------------------------------------------------------- 8. blinding light

const blindingLight: SpellDef = {
  id: 'blinding_light', name: '炫目圣光', level: 3, charges: 4,
  tags: ['enchantment', 'holy'], icon: 'icon_blinding_light', color: HOLY,
  target: 'self',
  stats: { radius: 8, duration: 5, sear: 5 },
  desc(s) {
    const out = [`使 ${s.radius} 格内的所有敌人失明 ${s.duration} 回合。`]
    out.push('失明的生物无法使用远程或指定目标的能力。')
    if (s.has('sear')) out.push(`它们还会受到 ${s.st('sear')} 点神圣伤害。`)
    if (!s.requiresLOS) out.push('可以致盲墙后的敌人。')
    return out.join('')
  },
  aoe: (s, g, x, y) => ballPoints(x, y, s.radius),
  cast(s, g, x, y) {
    g.fx.flash(x, y, '#ffffff')
    g.fx.burst(x, y, s.radius, HOLY)
    let hit = 0
    for (const u of unitsNear(g, x, y, s.radius, t => t.team !== 'player')) {
      if (s.requiresLOS && !g.level.hasLOS(x, y, u.x, u.y)) continue
      put(g, u, 'blind', s.duration)
      if (s.has('sear')) dealDamage(g, u, s.st('sear'), 'holy', g.player, s)
      hit++
    }
    g.log(hit > 0 ? `炫目圣光灼伤了 ${hit} 个生物。` : '光芒没有照到任何东西。', HOLY)
  },
  upgrades: [
    { id: 'wide', name: '广闪', desc: '半径 +3。', mods: { radius: 3 } },
    { id: 'glare', name: '持久强光', desc: '持续 +3 回合。', mods: { duration: 3 } },
    { id: 'sear', name: '灼光', desc: '额外造成 5 点神圣伤害。', flag: 'sear' },
    { id: 'faith', name: '盲信', desc: '致盲效果穿透墙壁。', flag: 'sightless' },
  ],
}

// ---------------------------------------------------------------- 9. void beam

/**
 * Tiles the beam sweeps: from the wizard through the aimed tile and onward to
 * the full range. Pure - `through` only decides whether walls stop it, the
 * digging happens in `cast` so the aiming preview matches what will happen.
 */
function beamPath(g: Game, tx: number, ty: number, len: number, through: boolean): Point[] {
  const px = g.player.x, py = g.player.y
  const dx = tx - px, dy = ty - py
  if (dx === 0 && dy === 0) return []
  // the second leg repeats the same integer offset, so the whole path stays one
  // straight ray; repeat it enough times to always cover the full range
  const reps = Math.ceil(len / Math.max(Math.abs(dx), Math.abs(dy))) + 1
  const pts = rayLine(px, py, tx, ty).concat(rayLine(tx, ty, tx + dx * reps, ty + dy * reps).slice(1))
  const out: Point[] = []
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]
    if (!g.level.inBounds(p.x, p.y)) break
    if (cheb(px, py, p.x, p.y) > len) break
    if (g.level.get(p.x, p.y) === Tile.Wall && !through) break
    out.push(p)
  }
  return out
}

const voidBeam: SpellDef = {
  id: 'void_beam', name: '虚空射线', level: 4, charges: 6,
  tags: ['sorcery', 'arcane', 'dark'], icon: 'icon_void_beam', color: VOID,
  target: 'tile',
  stats: { damage: 26, range: 10, duration: 4 },
  desc(s) {
    const out = [`射出一道贯穿光束，最远 ${s.range} 格，对路径上的每个生物造成 ${s.st('damage')} 点伤害。`]
    out.push('光束按目标抗性较低的一方判定为黑暗或奥术，只有完全免疫才能挡住。')
    if (s.has('melt')) out.push('熔穿途经的墙壁。')
    if (s.has('doom')) out.push(`存活者被打上厄运，效果结束时受到 ${Math.floor(s.st('damage') / 2)} 点黑暗伤害。`)
    return out.join('')
  },
  aoe: (s, g, x, y) => beamPath(g, x, y, s.range, s.has('melt')),
  cast(s, g, x, y) {
    const melt = s.has('melt')
    const path = beamPath(g, x, y, s.range, melt)
    if (!path.length) return
    const end = path[path.length - 1]
    g.fx.beam(g.player.x, g.player.y, end.x, end.y, VOID, 2)
    g.fx.area(path, VOID)
    for (const p of path) {
      if (melt) digWall(g, p.x, p.y)
      const u = g.level.unitAt(p.x, p.y)
      if (!u || u === g.player) continue
      const type: DamageType = u.resistOf('arcane') < u.resistOf('dark') ? 'arcane' : 'dark'
      dealDamage(g, u, s.st('damage'), type, g.player, s)
      if (s.has('doom') && u.alive) put(g, u, 'doomed', s.duration, Math.floor(s.st('damage') / 2))
    }
  },
  upgrades: [
    { id: 'lance', name: '虚空之枪', desc: '伤害 +8。', mods: { damage: 8 } },
    { id: 'long', name: '延展光束', desc: '射程 +4。', mods: { range: 4 } },
    { id: 'melt', name: '熔墙', desc: '光束熔穿墙壁并继续前进。', flag: 'melt' },
    { id: 'doom', name: '虚空腐蚀', desc: '存活者被打上厄运。', flag: 'doom' },
  ],
}

// ------------------------------------------------------------ 10. wheel of death

const wheelOfDeath: SpellDef = {
  id: 'wheel_of_death', name: '死亡之轮', level: 4, charges: 12,
  tags: ['sorcery', 'dark'], icon: 'icon_wheel_of_death', color: DARK,
  target: 'self',
  stats: { damage: 22, radius: 3, duration: 4 },
  desc(s) {
    const out = [`对距自身 ${s.radius} 格的环形范围内每个生物造成 ${s.st('damage')} 点黑暗伤害。`]
    out.push(s.has('selective') ? '随从不受影响。' : '随从同样会被卷入。')
    if (s.has('curse')) out.push(`存活者被诅咒 ${s.duration} 回合。`)
    return out.join('')
  },
  aoe: (s, g, x, y) => ringPoints(x, y, s.radius),
  cast(s, g, x, y) {
    const tiles = ringPoints(x, y, s.radius).filter(p => g.level.inBounds(p.x, p.y))
    g.fx.ring(x, y, s.radius, DARK)
    g.fx.area(tiles, DARK)
    for (const p of tiles) {
      const u = g.level.unitAt(p.x, p.y)
      if (!u || u === g.player) continue
      if (s.has('selective') && u.team === 'player') continue
      dealDamage(g, u, s.st('damage'), 'dark', g.player, s)
      if (s.has('curse') && u.alive) put(g, u, 'cursed', s.duration)
    }
  },
  upgrades: [
    { id: 'wide', name: '巨轮', desc: '半径 +1。', mods: { radius: 1 } },
    { id: 'harvest', name: '冷酷收割', desc: '伤害 +6。', mods: { damage: 6 } },
    { id: 'selective', name: '择敌之轮', desc: '随从不受伤害。', flag: 'selective' },
    { id: 'curse', name: '哀苦之轮', desc: '存活者受到的黑暗与神圣伤害提高 50%。', flag: 'curse' },
  ],
}

// ----------------------------------------------------------------- 11. scourge

/** Base damage plus `scale` for every 10 HP the wizard is missing. */
function scourgeDamage(s: SpellInst): number {
  const missing = Math.max(0, s.owner.effectiveMaxHP - s.owner.hp)
  return s.st('damage') + Math.floor(missing * s.st('scale') / 10)
}

const scourge: SpellDef = {
  id: 'scourge', name: '苦刑', level: 2, charges: 9, hpCost: 5,
  tags: ['sorcery', 'dark', 'blood'], icon: 'icon_scourge', color: BLOOD,
  target: 'enemy',
  stats: { damage: 5, range: 7, scale: 3 },
  desc(s) {
    const out = [`造成 ${s.st('damage')} 点黑暗伤害，自身每缺失 10 点生命再追加 ${s.st('scale')} 点（当前 ${scourgeDamage(s)} 点）。`]
    out.push(`消耗 ${s.hpCost} 点生命，这份缺失同样计入加成。`)
    if (s.has('lifetap')) out.push('按造成伤害的一半治疗自身，且不超过最大生命值。')
    return out.join('')
  },
  cast(s, g, x, y) {
    const u = g.level.unitAt(x, y)
    if (!u) return
    g.fx.bolt(g.player.x, g.player.y, x, y, BLOOD)
    g.fx.strike(x, y, BLOOD)
    const dealt = dealDamage(g, u, scourgeDamage(s), 'dark', g.player, s)
    if (s.has('lifetap') && dealt > 0) healUnit(g, g.player, Math.floor(dealt / 2))
  },
  upgrades: [
    { id: 'wound', name: '深创', desc: '基础伤害 +4。', mods: { damage: 4 } },
    { id: 'desperate', name: '绝境', desc: '每缺失 10 点生命的伤害 +2。', mods: { scale: 2 } },
    { id: 'far', name: '远咒', desc: '射程 +3。', mods: { range: 3 } },
    { id: 'lifetap', name: '汲命', desc: '按造成伤害的一半治疗自身。', flag: 'lifetap' },
  ],
}

// -------------------------------------------------------- 12. choir of angels

const choirOfAngels: SpellDef = {
  id: 'choir_of_angels', name: '天使圣咏', level: 3, charges: 3,
  tags: ['conjuration', 'holy'], icon: 'icon_choir_of_angels', color: HOLY,
  target: 'empty',
  stats: { num_summons: 2, minion_health: ANGEL_HP, minion_damage: ANGEL_DAMAGE, minion_range: 5, minion_duration: 15, range: 5 },
  desc(s) {
    const out = [`召唤 ${s.st('num_summons')} 名次级天使，各有 ${s.st('minion_health')} 点生命，以射程 ${s.st('minion_range')} 的圣光箭造成 ${s.st('minion_damage')} 点伤害。`]
    out.push(s.has('eternal') ? '它们直到阵亡都不会离去。' : `它们在 ${s.st('minion_duration')} 回合后离去。`)
    out.push('天使会飞行，且免疫黑暗伤害。')
    return out.join('')
  },
  cast(s, g, x, y) {
    const hpBonus = s.st('minion_health') - ANGEL_HP
    const damageBonus = s.st('minion_damage') - ANGEL_DAMAGE
    const duration = s.has('eternal') ? 0 : s.st('minion_duration')
    g.fx.flash(x, y, HOLY)
    let made = 0
    for (let i = 0; i < s.st('num_summons'); i++) {
      const u = summonUnit(g, 'angel_lesser', x, y, {
        team: 'player', duration, summoner: g.player, quiet: true, hpBonus, damageBonus,
      })
      if (!u) continue
      for (const a of u.attacks) if (a.kind === 'bolt') a.range = s.st('minion_range')
      made++
    }
    g.log(made > 0 ? `${made} 名天使应召而来。` : '没有地方容纳圣咏团。', HOLY)
  },
  upgrades: [
    { id: 'seraph', name: '宏大圣咏', desc: '天使 +1。', mods: { num_summons: 1 } },
    { id: 'blessed', name: '受祝之众', desc: '天使生命 +12。', mods: { minion_health: 12 } },
    { id: 'radiant', name: '光辉之声', desc: '圣光箭伤害 +3，射程 +2。', mods: { minion_damage: 3, minion_range: 2 } },
    { id: 'eternal', name: '永恒合唱', desc: '天使永不离去。', cost: 4, flag: 'eternal' },
  ],
}

export const spells: SpellDef[] = [
  deathBolt, lifedrain, heavenlyBlast, healingLight, touchOfDeath, deathChill,
  holyFire, blindingLight, voidBeam, wheelOfDeath, scourge, choirOfAngels,
]

// ------------------------------------------------------------------ support units

const angelLesser: UnitDef = {
  id: 'angel_lesser', name: '次级天使', sprite: 'mon_angel_lesser', color: HOLY,
  maxHP: ANGEL_HP, level: 3, team: 'player', flying: true,
  tags: ['holy'],
  resists: { holy: 100, ice: 25 },
  passives: ['holy_armor'],
  attacks: [
    { kind: 'bolt', name: '圣光箭', range: 5, damage: ANGEL_DAMAGE, damageType: 'holy', color: HOLY },
  ],
  description: '圣咏的一片碎响，焚烧不洁之物，对黑暗不屑一顾。',
}

export const units: UnitDef[] = [angelLesser]

// ------------------------------------------------------------------------ art

export const sprites: Record<string, SpriteDef> = {
  icon_death_bolt: {
    palette: [DARK, '#e6c8ff', '#2a1038'],
    shapes: [
      { t: 'poly', pts: [0.22, 0.92, 0.44, 0.58, 0.32, 0.54, 0.6, 0.1, 0.5, 0.46, 0.66, 0.5], fill: '$2', stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.66, y: 0.68, r: 0.17, fill: '$2', stroke: '$0', w: 0.045 },
      { t: 'circle', x: 0.6, y: 0.65, r: 0.04, fill: '$1' },
      { t: 'circle', x: 0.73, y: 0.65, r: 0.04, fill: '$1' },
      { t: 'line', pts: [0.59, 0.78, 0.74, 0.78], stroke: '$0', w: 0.03 },
    ],
  },

  icon_lifedrain: {
    palette: [BLOOD, '#ff9aa8', '#3a0a12'],
    shapes: [
      { t: 'poly', pts: [0.46, 0.9, 0.14, 0.54, 0.13, 0.36, 0.25, 0.24, 0.38, 0.28, 0.46, 0.44, 0.54, 0.28, 0.67, 0.24, 0.79, 0.36, 0.78, 0.54], fill: '$2', stroke: '$0', w: 0.045 },
      { t: 'circle', x: 0.3, y: 0.4, r: 0.055, fill: '$1' },
      { t: 'line', pts: [0.66, 0.44, 0.94, 0.24], stroke: '$1', w: 0.045 },
      { t: 'line', pts: [0.62, 0.6, 0.92, 0.44], stroke: '$1', w: 0.026 },
      { t: 'circle', x: 0.9, y: 0.22, r: 0.09, fill: '$2', stroke: '$1', w: 0.032 },
    ],
  },

  icon_heavenly_blast: {
    palette: ['#ffe89a', '#fff8d8', '#4a3a10'],
    shapes: [
      { t: 'poly', pts: [0.41, 0.02, 0.59, 0.02, 0.78, 0.7, 0.22, 0.7], fill: '$2', stroke: '$0', w: 0.045 },
      { t: 'line', pts: [0.5, 0.06, 0.5, 0.66], stroke: '$1', w: 0.03 },
      { t: 'ellipse', x: 0.5, y: 0.78, rx: 0.32, ry: 0.11, fill: '$2', stroke: '$0', w: 0.04 },
      { t: 'circle', x: 0.5, y: 0.78, r: 0.08, fill: '$1' },
      { t: 'line', pts: [0.2, 0.92, 0.28, 0.82], stroke: '$0', w: 0.035 },
      { t: 'line', pts: [0.8, 0.92, 0.72, 0.82], stroke: '$0', w: 0.035 },
    ],
  },

  icon_healing_light: {
    palette: [LIFE, '#e8fff0', '#0f3a22'],
    shapes: [
      { t: 'circle', x: 0.5, y: 0.52, r: 0.31, fill: '$2', stroke: '$0', w: 0.05 },
      { t: 'poly', pts: [0.44, 0.28, 0.56, 0.28, 0.56, 0.76, 0.44, 0.76], fill: '$0', stroke: '$1', w: 0.03 },
      { t: 'poly', pts: [0.28, 0.46, 0.72, 0.46, 0.72, 0.58, 0.28, 0.58], fill: '$0', stroke: '$1', w: 0.03 },
      { t: 'arc', x: 0.5, y: 0.52, r: 0.42, a0: -2.5, a1: -0.65, stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.5, y: 0.52, r: 0.05, fill: '$1' },
    ],
  },

  icon_touch_of_death: {
    palette: ['#8f5ad0', '#e6c8ff', '#1e1030'],
    shapes: [
      { t: 'poly', pts: [0.38, 0.98, 0.35, 0.8, 0.65, 0.8, 0.62, 0.98], fill: '$2', stroke: '$1', w: 0.032 },
      { t: 'blob', x: 0.5, y: 0.63, r: 0.23, lobes: 5, fill: '$2', stroke: '$1', w: 0.042 },
      { t: 'line', pts: [0.35, 0.5, 0.29, 0.2], stroke: '$1', w: 0.05 },
      { t: 'line', pts: [0.5, 0.46, 0.5, 0.12], stroke: '$1', w: 0.05 },
      { t: 'line', pts: [0.65, 0.5, 0.71, 0.2], stroke: '$1', w: 0.05 },
      { t: 'line', pts: [0.31, 0.68, 0.15, 0.58], stroke: '$1', w: 0.045 },
      { t: 'circle', x: 0.52, y: 0.64, r: 0.075, fill: '$0' },
    ],
  },

  icon_death_chill: {
    palette: [ICE, '#dff5ff', '#16283a'],
    shapes: [
      { t: 'blob', x: 0.5, y: 0.62, r: 0.27, lobes: 5, fill: '$2', stroke: '$0', w: 0.045 },
      { t: 'circle', x: 0.42, y: 0.6, r: 0.045, fill: '$1' },
      { t: 'circle', x: 0.58, y: 0.6, r: 0.045, fill: '$1' },
      { t: 'line', pts: [0.42, 0.78, 0.58, 0.78], stroke: '$0', w: 0.03 },
      { t: 'line', pts: [0.5, 0.04, 0.5, 0.34], stroke: '$0', w: 0.04 },
      { t: 'line', pts: [0.28, 0.12, 0.72, 0.3], stroke: '$0', w: 0.03 },
      { t: 'line', pts: [0.72, 0.12, 0.28, 0.3], stroke: '$0', w: 0.03 },
    ],
  },

  icon_holy_fire: {
    palette: ['#ffd84a', '#fff4c0', '#5a3a08'],
    shapes: [
      { t: 'blob', x: 0.5, y: 0.66, r: 0.28, lobes: 6, fill: '$2', stroke: '$0', w: 0.045 },
      { t: 'poly', pts: [0.5, 0.2, 0.68, 0.62, 0.32, 0.62], fill: '$2', stroke: '$0', w: 0.04 },
      { t: 'blob', x: 0.5, y: 0.7, r: 0.13, lobes: 5, fill: '$0', stroke: '$1', w: 0.03 },
      { t: 'arc', x: 0.5, y: 0.26, r: 0.24, a0: 3.5, a1: 5.9, stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.5, y: 0.71, r: 0.05, fill: '$1' },
    ],
  },

  icon_blinding_light: {
    palette: ['#fff8d8', '#ffe89a', '#4a4218'],
    shapes: [
      { t: 'poly', pts: [0.5, 0.02, 0.58, 0.42, 0.5, 0.98, 0.42, 0.42], fill: '$1', stroke: '$2', w: 0.025 },
      { t: 'poly', pts: [0.02, 0.5, 0.42, 0.58, 0.98, 0.5, 0.42, 0.42], fill: '$1', stroke: '$2', w: 0.025 },
      { t: 'circle', x: 0.5, y: 0.5, r: 0.21, fill: '$2', stroke: '$0', w: 0.045 },
      { t: 'line', pts: [0.19, 0.19, 0.36, 0.36], stroke: '$0', w: 0.04 },
      { t: 'line', pts: [0.81, 0.19, 0.64, 0.36], stroke: '$0', w: 0.04 },
      { t: 'line', pts: [0.19, 0.81, 0.36, 0.64], stroke: '$0', w: 0.04 },
      { t: 'line', pts: [0.81, 0.81, 0.64, 0.64], stroke: '$0', w: 0.04 },
      { t: 'circle', x: 0.5, y: 0.5, r: 0.07, fill: '$0' },
    ],
  },

  icon_void_beam: {
    palette: [VOID, '#ffd0f0', '#1a0a24'],
    shapes: [
      { t: 'poly', pts: [0.08, 0.7, 0.9, 0.18, 0.97, 0.34, 0.16, 0.88], fill: '$2', stroke: '$0', w: 0.04 },
      { t: 'line', pts: [0.12, 0.79, 0.93, 0.27], stroke: '$1', w: 0.028 },
      { t: 'circle', x: 0.17, y: 0.79, r: 0.13, fill: '$2', stroke: '$0', w: 0.045 },
      { t: 'circle', x: 0.17, y: 0.79, r: 0.05, fill: '$1' },
      { t: 'circle', x: 0.87, y: 0.25, r: 0.08, fill: '$0' },
      { t: 'line', pts: [0.6, 0.3, 0.7, 0.6], stroke: '$0', w: 0.025 },
    ],
  },

  icon_wheel_of_death: {
    palette: [DARK, '#e6c8ff', '#241030'],
    shapes: [
      { t: 'circle', x: 0.5, y: 0.5, r: 0.35, fill: '$2', stroke: '$0', w: 0.05 },
      { t: 'circle', x: 0.5, y: 0.5, r: 0.14, fill: '$2', stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.22, 0.22, 0.78, 0.78], stroke: '$0', w: 0.04 },
      { t: 'line', pts: [0.78, 0.22, 0.22, 0.78], stroke: '$0', w: 0.04 },
      { t: 'poly', pts: [0.5, 0.02, 0.62, 0.2, 0.38, 0.2], fill: '$2', stroke: '$1', w: 0.03 },
      { t: 'circle', x: 0.5, y: 0.5, r: 0.05, fill: '$1' },
    ],
  },

  icon_scourge: {
    palette: [BLOOD, '#ff9aa8', '#3a0a12'],
    shapes: [
      { t: 'arc', x: 0.42, y: 0.32, r: 0.32, a0: 0.3, a1: 2.7, stroke: '$0', w: 0.065 },
      { t: 'arc', x: 0.64, y: 0.68, r: 0.26, a0: 3.4, a1: 5.6, stroke: '$0', w: 0.05 },
      { t: 'circle', x: 0.2, y: 0.24, r: 0.11, fill: '$2', stroke: '$1', w: 0.04 },
      { t: 'blob', x: 0.84, y: 0.84, r: 0.1, lobes: 5, fill: '$2', stroke: '$1', w: 0.03 },
      { t: 'circle', x: 0.48, y: 0.9, r: 0.05, fill: '$0' },
      { t: 'circle', x: 0.68, y: 0.38, r: 0.04, fill: '$0' },
    ],
  },

  icon_choir_of_angels: {
    palette: ['#ffe89a', '#fff8d8', '#3a2e0c'],
    shapes: [
      { t: 'poly', pts: [0.5, 0.4, 0.63, 0.92, 0.37, 0.92], fill: '$2', stroke: '$0', w: 0.04 },
      { t: 'poly', pts: [0.38, 0.46, 0.08, 0.34, 0.13, 0.62, 0.36, 0.62], fill: '$2', stroke: '$1', w: 0.035 },
      { t: 'poly', pts: [0.62, 0.46, 0.92, 0.34, 0.87, 0.62, 0.64, 0.62], fill: '$2', stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.5, y: 0.42, r: 0.08, fill: '$1' },
      { t: 'circle', x: 0.5, y: 0.24, r: 0.11, stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.18, y: 0.18, r: 0.055, stroke: '$0', w: 0.03 },
      { t: 'circle', x: 0.82, y: 0.18, r: 0.055, stroke: '$0', w: 0.03 },
    ],
  },

  mon_angel_lesser: {
    palette: ['#1e2a44', '#ffe89a', '#fff8d8', '#0c1220'],
    wobble: 0.4,
    shapes: [
      { t: 'poly', pts: [0.4, 0.44, 0.04, 0.24, 0.1, 0.6, 0.38, 0.6], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.6, 0.44, 0.96, 0.24, 0.9, 0.6, 0.62, 0.6], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.5, 0.34, 0.66, 0.92, 0.34, 0.92], fill: '$0', stroke: '$2', w: 0.045 },
      { t: 'circle', x: 0.5, y: 0.3, r: 0.11, fill: '$2', stroke: '$1', w: 0.03 },
      { t: 'circle', x: 0.46, y: 0.3, r: 0.02, fill: '$3' },
      { t: 'circle', x: 0.54, y: 0.3, r: 0.02, fill: '$3' },
      { t: 'circle', x: 0.5, y: 0.11, r: 0.1, stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.5, 0.5, 0.5, 0.86], stroke: '$2', w: 0.03 },
    ],
  },
}
