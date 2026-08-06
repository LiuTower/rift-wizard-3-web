import type { SpellDef, SpellInst } from '../../core/spell'
import type { Buff, Unit, UnitDef } from '../../core/unit'
import type { Game } from '../../core/game'
import type { SpriteDef } from '../../render/sprite'
import { applyBuff, dealDamage, summonUnit, unitsNear } from '../../core/combat'
import { makeBuff } from '../../core/buffs'
import { cheb } from '../../core/geom'

// ---------------------------------------------------------------- summon glue

/**
 * Summon a minion and stamp the caster's numbers onto it, so every upgrade,
 * artifact bonus and tag bonus reaches the creature. `summonUnit` has already
 * folded in the wizard's `minion`-scope bonuses; those are re-added on top of
 * the spell's own stats because we overwrite the base values.
 */
function summonMinion(s: SpellInst, g: Game, defId: string, x: number, y: number, quiet = false): Unit | undefined {
  const dur = s.st('minion_duration')
  const u = summonUnit(g, defId, x, y, {
    team: 'player',
    summoner: g.player,
    quiet,
    duration: dur > 0 ? dur : undefined,
  })
  if (!u) return undefined
  const hp = s.st('minion_health') + g.player.minionBonus('minion_health')
  const dmg = s.st('minion_damage') + g.player.minionBonus('minion_damage')
  const reach = s.st('minion_range')
  u.maxHP = Math.max(1, hp)
  u.hp = u.maxHP
  for (const a of u.attacks) {
    if (a.damage) a.damage = Math.max(1, dmg)
    if (reach > 0 && (a.range ?? 1) > 1) a.range = reach
  }
  return u
}

/** Summon `n` minions around a point. Groups get one tidy log line. */
function summonPack(s: SpellInst, g: Game, defId: string, x: number, y: number, n: number, label: string): Unit[] {
  const out: Unit[] = []
  const many = n > 1
  for (let i = 0; i < n; i++) {
    const u = summonMinion(s, g, defId, x, y, many)
    if (u) out.push(u)
  }
  if (many && out.length) g.log(`${out.length} ${label}响应召唤。`, '#9affc0')
  return out
}

function grant(g: Game, u: Unit, id: string, power?: number): void {
  const b = makeBuff(id, -1, power)
  if (b) applyBuff(g, u, b)
}

/** Chinese has no plural forms, so count with the right measure word instead. */
function count(n: number, measure: string, noun: string): string {
  return `${n} ${measure}${noun}`
}

// ------------------------------------------------------------- custom passives

/** Retaliation for the Earthen Sentinel's Stone Spines upgrade. */
function spinesBuff(dmg: number): Buff {
  return {
    id: 'stone_spines', name: '石刺', kind: 'buff', duration: -1, color: '#a89880',
    desc: `近战攻击者受到 ${dmg} 点物理伤害。`,
    onHurt(u, g, ev) {
      const src = ev.source
      if (!src || !src.alive || src.team === u.team) return
      if (cheb(u.x, u.y, src.x, src.y) > 1) return
      dealDamage(g, src, dmg, 'physical', u)
    },
  }
}

/** Death burst for the Imp Swarm's Volatile upgrade. */
function volatileBuff(dmg: number): Buff {
  return {
    id: 'volatile_imp', name: '易爆', kind: 'buff', duration: -1, color: '#ff8f5a',
    desc: `死亡时爆发 ${dmg} 点火焰伤害。`,
    onDeath(u, g) {
      g.fx.burst(u.x, u.y, 1, '#ff8f5a')
      for (const v of unitsNear(g, u.x, u.y, 1, t => t !== u && t.team !== u.team)) {
        dealDamage(g, v, dmg, 'fire', u.summoner)
      }
    },
  }
}

// ------------------------------------------------------- realm death bookkeeping

interface RealmDeaths { seed: string; realm: number; count: number }

const realmDeaths = new WeakMap<Game, RealmDeaths>()

/** Reset the tally when the wizard moves on to another realm, or starts a new run. */
function syncRealm(g: Game, t: RealmDeaths): void {
  if (t.seed === g.run.seed && t.realm === g.run.realmIndex) return
  t.seed = g.run.seed
  t.realm = g.run.realmIndex
  t.count = 0
}

/**
 * Enemies slain in the realm the wizard is standing in. The engine only keeps
 * run totals, so the first time The Restless Dead is inspected we hook the death
 * feed and keep our own per-realm tally.
 */
function slainThisRealm(g: Game): number {
  const existing = realmDeaths.get(g)
  if (existing) { syncRealm(g, existing); return existing.count }
  const tally: RealmDeaths = { seed: g.run.seed, realm: g.run.realmIndex, count: 0 }
  realmDeaths.set(g, tally)
  g.on('death', payload => {
    const victim = (payload as { unit?: Unit } | undefined)?.unit
    if (victim?.team !== 'enemy') return
    syncRealm(g, tally)
    tally.count++
  })
  return tally.count
}

// -------------------------------------------------------------------- spells

const wolf: SpellDef = {
  id: 'wolf', name: '召唤狼', level: 1, charges: 7,
  tags: ['conjuration', 'nature'], icon: 'icon_wolf', color: '#b0ff9a',
  target: 'empty',
  stats: { range: 4, num_summons: 1, minion_health: 14, minion_damage: 5 },
  desc: s => `召唤 ${count(s.st('num_summons'), '头', '狼')}，具有 ${s.st('minion_health')} 点生命`
    + `，撕咬造成 ${s.st('minion_damage')} 点${s.has('frost') ? '冰霜' : ''}伤害。`,
  cast(s, g, x, y) {
    const pack = summonPack(s, g, 'wolf', x, y, s.st('num_summons'), '头狼')
    if (!s.has('frost')) return
    for (const u of pack) {
      u.color = '#a8e8ff'
      u.resists.ice = 100
      for (const a of u.attacks) if (a.damage) { a.damageType = 'ice'; a.color = '#7fd8ff' }
    }
  },
  upgrades: [
    { id: 'pack', name: '群猎', desc: '额外召唤一头狼。', mods: { num_summons: 1 } },
    { id: 'hardy', name: '厚毛皮', desc: '狼生命 +8。', mods: { minion_health: 8 } },
    { id: 'fangs', name: '利齿', desc: '撕咬伤害 +3。', mods: { minion_damage: 3 } },
    { id: 'frost', name: '霜狼', desc: '撕咬造成冰霜伤害；狼免疫冰霜。', flag: 'frost' },
  ],
}

const earthenSentinel: SpellDef = {
  id: 'earthen_sentinel', name: '大地哨卫', level: 3, charges: 5,
  tags: ['conjuration', 'nature', 'metallic'], icon: 'icon_earthen_sentinel', color: '#a89880',
  target: 'empty',
  stats: { range: 6, minion_health: 40, minion_damage: 9 },
  desc: s => `唤起一尊固定不动的哨卫，具有 ${s.st('minion_health')} 点生命，碾碎相邻敌人`
    + `造成 ${s.st('minion_damage')} 点伤害。它堵住通路，永不移动。`,
  cast(s, g, x, y) {
    const u = summonMinion(s, g, 'sentinel_earthen', x, y)
    if (!u) return
    if (s.has('bulwark')) u.shields += 3
    if (s.has('spines')) applyBuff(g, u, spinesBuff(Math.max(2, Math.floor(s.st('minion_damage') / 2))))
  },
  upgrades: [
    { id: 'granite', name: '花岗岩核心', desc: '哨卫生命 +20。', mods: { minion_health: 20 } },
    { id: 'crush', name: '碎击之拳', desc: '伤害 +4。', mods: { minion_damage: 4 } },
    { id: 'spines', name: '石刺', desc: '近战攻击者受到哨卫一半伤害的反击。', flag: 'spines' },
    { id: 'bulwark', name: '壁垒', desc: '哨卫获得 3 点护盾。', flag: 'bulwark' },
  ],
}

const giantBear: SpellDef = {
  id: 'giant_bear', name: '巨熊', level: 3, charges: 2,
  tags: ['conjuration', 'nature'], icon: 'icon_giant_bear', color: '#d8b890',
  target: 'empty',
  stats: { range: 4, minion_health: 42, minion_damage: 10 },
  desc: s => `召唤一头巨熊，具有 ${s.st('minion_health')} 点生命，重击造成 ${s.st('minion_damage')} 点伤害`
    + `${s.has('rend') ? '，并留下流血伤口' : ''}。`,
  cast(s, g, x, y) {
    const u = summonMinion(s, g, 'bear_giant', x, y)
    if (!u) return
    if (s.has('rend')) for (const a of u.attacks) if (a.damage) {
      a.buff = 'bleeding'; a.buffDuration = 5; a.buffPower = 3
    }
    if (s.has('hibernal')) grant(g, u, 'regen', 4)
  },
  upgrades: [
    { id: 'grizzly', name: '灰毛老熊', desc: '巨熊生命 +18。', mods: { minion_health: 18 } },
    { id: 'maul', name: '重击', desc: '伤害 +5。', mods: { minion_damage: 5 } },
    { id: 'rend', name: '裂爪', desc: '命中造成流血，持续 5 回合。', flag: 'rend' },
    { id: 'hibernal', name: '冬眠活力', desc: '巨熊每回合恢复 4 点生命。', flag: 'hibernal' },
  ],
}

const fireDrake: SpellDef = {
  id: 'fire_drake', name: '火龙', level: 4, charges: 2,
  tags: ['conjuration', 'dragon', 'fire'], icon: 'icon_fire_drake', color: '#ff7a3a',
  target: 'empty',
  stats: { range: 6, minion_health: 45, minion_damage: 9, minion_range: 5 },
  desc: s => `召唤一头飞行的火龙，具有 ${s.st('minion_health')} 点生命。它向`
    + ` ${s.st('minion_range')} 格锥形范围喷吐火焰，造成 ${s.st('minion_damage')} 点伤害，利爪伤害相同。`,
  cast(s, g, x, y) {
    const u = summonMinion(s, g, 'drake_fire', x, y)
    if (!u) return
    if (s.has('aura')) grant(g, u, 'flame_aura', 3)
  },
  upgrades: [
    { id: 'scales', name: '厚鳞', desc: '火龙生命 +20。', mods: { minion_health: 20 } },
    { id: 'inferno', name: '炼狱之喉', desc: '伤害 +4。', mods: { minion_damage: 4 } },
    { id: 'longbreath', name: '长息', desc: '吐息射程 +2。', mods: { minion_range: 2 } },
    { id: 'aura', name: '余烬之幕', desc: '火龙每回合灼烧 2 格内的敌人 3 点。', flag: 'aura' },
  ],
}

const iceDrake: SpellDef = {
  id: 'ice_drake', name: '冰龙', level: 4, charges: 2,
  tags: ['conjuration', 'dragon', 'ice'], icon: 'icon_ice_drake', color: '#7fd8ff',
  target: 'empty',
  stats: { range: 6, minion_health: 45, minion_damage: 9, minion_range: 5 },
  desc: s => `召唤一头飞行的冰龙，具有 ${s.st('minion_health')} 点生命。它向`
    + ` ${s.st('minion_range')} 格锥形范围喷吐寒霜，造成 ${s.st('minion_damage')} 点伤害`
    + `${s.has('deepfreeze') ? '，并冰冻命中的目标' : ''}。`,
  cast(s, g, x, y) {
    const u = summonMinion(s, g, 'drake_ice', x, y)
    if (!u) return
    if (s.has('deepfreeze')) {
      const breath = u.attacks.find(a => a.kind === 'breath')
      if (breath) { breath.buff = 'frozen'; breath.buffDuration = 1 }
    }
    if (s.has('aura')) grant(g, u, 'frost_aura', 3)
  },
  upgrades: [
    { id: 'scales', name: '霜鳞', desc: '冰龙生命 +20。', mods: { minion_health: 20 } },
    { id: 'bitter', name: '刺骨严寒', desc: '伤害 +4。', mods: { minion_damage: 4 } },
    { id: 'deepfreeze', name: '深度冰封', desc: '霜息使目标冰冻 1 回合。', flag: 'deepfreeze' },
    { id: 'aura', name: '寒霜之幕', desc: '冰龙每回合冻伤 2 格内的敌人 3 点。', flag: 'aura' },
  ],
}

const stormDrake: SpellDef = {
  id: 'storm_drake', name: '雷龙', level: 4, charges: 2,
  tags: ['conjuration', 'dragon', 'lightning'], icon: 'icon_storm_drake', color: '#ffe019',
  target: 'empty',
  stats: { range: 6, minion_health: 45, minion_damage: 9, minion_range: 5 },
  desc: s => `召唤一头飞行的雷龙，具有 ${s.st('minion_health')} 点生命。它向`
    + ` ${s.st('minion_range')} 格锥形范围喷吐闪电，造成 ${s.st('minion_damage')} 点伤害`
    + `${s.has('conduct') ? '，并使目标导电' : ''}。`,
  cast(s, g, x, y) {
    const u = summonMinion(s, g, 'drake_storm', x, y)
    if (!u) return
    if (s.has('conduct')) {
      const breath = u.attacks.find(a => a.kind === 'breath')
      if (breath) { breath.buff = 'conductance'; breath.buffDuration = 4 }
    }
    if (s.has('aura')) grant(g, u, 'storm_aura', 3)
  },
  upgrades: [
    { id: 'scales', name: '蓄电鳞片', desc: '雷龙生命 +20。', mods: { minion_health: 20 } },
    { id: 'thunder', name: '雷鸣', desc: '伤害 +4。', mods: { minion_damage: 4 } },
    { id: 'conduct', name: '导电吐息', desc: '吐息使目标受到的闪电伤害翻倍。', flag: 'conduct' },
    { id: 'aura', name: '静电之幕', desc: '雷龙每回合电击 2 格内的敌人 3 点。', flag: 'aura' },
  ],
}

const impSwarm: SpellDef = {
  id: 'imp_swarm', name: '小鬼群', level: 4, charges: 3,
  tags: ['conjuration', 'fire', 'chaos'], icon: 'icon_imp_swarm', color: '#ff5a7a',
  target: 'empty',
  stats: { range: 8, num_summons: 3, minion_health: 12, minion_damage: 5, minion_range: 4, minion_duration: 14 },
  desc: s => `撕开一道裂隙，放 ${s.st('num_summons')} 只飞行小鬼进来，持续 ${s.st('minion_duration')} 回合。`
    + `每只有 ${s.st('minion_health')} 点生命，火焰箭造成 ${s.st('minion_damage')} 点伤害`
    + `${s.has('volatile') ? '，死亡时炸成一团火' : ''}。`,
  cast(s, g, x, y) {
    const imps = summonPack(s, g, 'imp_chaos', x, y, s.st('num_summons'), '只小鬼')
    if (!s.has('volatile')) return
    for (const u of imps) applyBuff(g, u, volatileBuff(s.st('minion_damage')))
  },
  upgrades: [
    { id: 'horde', name: '鬼潮', desc: '额外两只小鬼。', mods: { num_summons: 2 } },
    { id: 'hellfire', name: '地狱火', desc: '火焰箭伤害 +3。', mods: { minion_damage: 3 } },
    { id: 'enduring', name: '长绳', desc: '小鬼多停留 10 回合。', mods: { minion_duration: 10 } },
    { id: 'volatile', name: '易爆', desc: '小鬼死亡时爆发出等同其伤害的火焰伤害。', flag: 'volatile' },
  ],
}

const theRestlessDead: SpellDef = {
  id: 'the_restless_dead', name: '不安亡者', level: 4, charges: 3,
  tags: ['conjuration', 'dark'], icon: 'icon_the_restless_dead', color: '#a05ad0',
  target: 'empty',
  stats: { range: 8, minion_health: 18, minion_damage: 6, max_summons: 6 },
  desc: s => `本领域中每有一名敌人被杀，便唤起一具骷髅，最多 ${s.st('max_summons')} 具。`
    + `每具有 ${s.st('minion_health')} 点生命，骨爪造成 ${s.st('minion_damage')} 点伤害`
    + `${s.has('archers') ? '，另有骨刺齐射' : ''}。`,
  canTarget: (_s, g) => slainThisRealm(g) > 0,
  cast(s, g, x, y) {
    const n = Math.min(slainThisRealm(g), s.st('max_summons'))
    if (n <= 0) { g.log('此处无人回应。', '#8890a0'); return }
    g.fx.ring(x, y, 2, '#a05ad0')
    const risen = summonPack(s, g, 'skeleton_risen', x, y, n, '具骷髅')
    if (!s.has('archers')) return
    const shard = Math.max(2, s.st('minion_damage') - 2)
    for (const u of risen) {
      u.attacks.push({ kind: 'bolt', name: '骨刺', range: 5, damage: shard, damageType: 'physical', color: '#e8e0c8' })
      u.cooldowns.push(0)
    }
  },
  upgrades: [
    { id: 'mass_grave', name: '万人坑', desc: '最多可多唤起 3 具骷髅。', mods: { max_summons: 3 } },
    { id: 'bone_armor', name: '骨甲', desc: '骷髅生命 +8。', mods: { minion_health: 8 } },
    { id: 'grave_might', name: '墓中之力', desc: '骨爪伤害 +3。', mods: { minion_damage: 3 } },
    { id: 'archers', name: '骷髅弓手', desc: '骷髅还会投掷骨刺，射程 5 格。', flag: 'archers' },
  ],
}

const spiderQueen: SpellDef = {
  id: 'spider_queen', name: '蛛后', level: 5, charges: 2,
  tags: ['conjuration', 'nature'], icon: 'icon_spider_queen', color: '#a8d84a',
  target: 'empty',
  stats: { range: 6, minion_health: 65, minion_damage: 12 },
  desc: s => `召唤一只蛛后，具有 ${s.st('minion_health')} 点生命，毒牙造成 ${s.st('minion_damage')} 点`
    + `毒素伤害。她每隔几回合诞下${s.has('brood') ? '两只子蛛' : '一只子蛛'}`
    + `${s.has('webs') ? '，并能用蛛网将远处敌人定在原地' : ''}。`,
  cast(s, g, x, y) {
    const u = summonMinion(s, g, 'spider_queen_minion', x, y)
    if (!u) return
    if (s.has('brood')) {
      const brood = u.attacks.find(a => a.kind === 'summon')
      if (brood) brood.summonCount = 2
    }
    if (s.has('webs')) {
      u.attacks.push({ kind: 'debuff', name: '蛛网', range: 4, cooldown: 3, buff: 'rooted', buffDuration: 2, color: '#c8f0ff' })
      u.cooldowns.push(0)
    }
  },
  upgrades: [
    { id: 'carapace', name: '甲壳外壳', desc: '蛛后生命 +25。', mods: { minion_health: 25 } },
    { id: 'venom', name: '致命毒液', desc: '毒牙伤害 +4。', mods: { minion_damage: 4 } },
    { id: 'brood', name: '多产蛛巢', desc: '她每次诞下两只子蛛。', flag: 'brood' },
    { id: 'webs', name: '缚网', desc: '她向 4 格内的敌人吐网，使其缠绕。', flag: 'webs' },
  ],
}

const frostfireHydra: SpellDef = {
  id: 'frostfire_hydra', name: '霜火九头蛇', level: 3, charges: 7,
  tags: ['conjuration', 'fire', 'ice'], icon: 'icon_frostfire_hydra', color: '#ff9f7a',
  target: 'empty',
  stats: { range: 6, minion_health: 30, minion_damage: 9, minion_range: 6 },
  desc: s => `培育一头扎根的双头九头蛇，具有 ${s.st('minion_health')} 点生命。它交替喷吐火焰与寒霜，`
    + `锥形范围 ${s.st('minion_range')} 格，造成 ${s.st('minion_damage')} 点伤害`
    + `${s.has('affliction') ? '；火焰点燃目标，寒霜熔蚀护甲' : ''}。`,
  cast(s, g, x, y) {
    const u = summonMinion(s, g, 'hydra_frostfire', x, y)
    if (!u) return
    if (!s.has('affliction')) return
    for (const a of u.attacks) {
      if (a.damageType === 'fire') { a.buff = 'burning'; a.buffDuration = 3; a.buffPower = 3 }
      if (a.damageType === 'ice') { a.buff = 'melted'; a.buffDuration = 3 }
    }
  },
  upgrades: [
    { id: 'scaled', name: '硬化皮革', desc: '九头蛇生命 +15。', mods: { minion_health: 15 } },
    { id: 'hotter', name: '双炉', desc: '吐息伤害 +4。', mods: { minion_damage: 4 } },
    { id: 'reach', name: '长颈', desc: '吐息射程 +3。', mods: { minion_range: 3 } },
    { id: 'affliction', name: '元素侵蚀', desc: '火焰吐息点燃目标；寒霜吐息熔蚀其防御。', flag: 'affliction' },
  ],
}

const siegeGolems: SpellDef = {
  id: 'siege_golems', name: '攻城魔像', level: 4, charges: 3,
  tags: ['conjuration', 'metallic'], icon: 'icon_siege_golems', color: '#a8b8c8',
  target: 'empty',
  stats: { range: 6, num_summons: 2, minion_health: 50, minion_damage: 12, minion_range: 6 },
  desc: s => `组装 ${s.st('num_summons')} 座攻城魔像，每座 ${s.st('minion_health')} 点生命。它们把巨石`
    + `投到 ${s.st('minion_range')} 格外，并砸碎相邻敌人，造成 ${s.st('minion_damage')} 点伤害`
    + `${s.has('shrapnel') ? '；巨石会在 1 格球形范围内炸开' : ''}。`,
  cast(s, g, x, y) {
    const crew = summonPack(s, g, 'golem_siege', x, y, s.st('num_summons'), '座攻城魔像')
    if (!s.has('shrapnel')) return
    for (const u of crew) {
      const rock = u.attacks.find(a => a.kind === 'bolt')
      if (rock) { rock.kind = 'blast'; rock.radius = 1 }
    }
  },
  upgrades: [
    { id: 'crew', name: '增员', desc: '多组装一座魔像。', mods: { num_summons: 1 } },
    { id: 'plated', name: '装甲板', desc: '魔像生命 +20。', mods: { minion_health: 20 } },
    { id: 'heavy', name: '重型军械', desc: '伤害 +4。', mods: { minion_damage: 4 } },
    { id: 'shrapnel', name: '破片弹', desc: '投出的巨石在 1 格球形范围内炸开。', flag: 'shrapnel' },
  ],
}

export const spells: SpellDef[] = [
  wolf, earthenSentinel, giantBear, fireDrake, iceDrake, stormDrake,
  impSwarm, theRestlessDead, spiderQueen, frostfireHydra, siegeGolems,
]

// --------------------------------------------------------------------- minions

/**
 * Conjured creatures. The engine assigns `team` at summon time, and
 * `minRealm: 99` keeps them out of the wild monster pool used by level
 * generation (which filters on team, boss tag, level and minRealm): these
 * stat blocks are balanced as minions, not as encounters.
 */
export const units: UnitDef[] = [
  {
    id: 'wolf', name: '狼', sprite: 'mon_wolf', color: '#b8c4d4',
    maxHP: 14, level: 1, minRealm: 99, tags: ['living', 'nature'],
    attacks: [{ kind: 'melee', name: '撕咬', damage: 5, damageType: 'physical' }],
    description: '精瘦、迅捷，而且对此相当自得。',
  },
  {
    id: 'sentinel_earthen', name: '大地哨卫', sprite: 'mon_sentinel_earthen', color: '#a89880',
    maxHP: 40, level: 3, minRealm: 99, stationary: true, tags: ['construct', 'nature'],
    resists: { physical: 50, ice: 50, poison: 100 },
    attacks: [{ kind: 'melee', name: '碾碎', damage: 9, damageType: 'physical' }],
    description: '一根夯土立柱。它不会移动，它身后的东西也别想动。',
  },
  {
    id: 'bear_giant', name: '巨熊', sprite: 'mon_bear_giant', color: '#d8b890',
    maxHP: 42, level: 3, minRealm: 99, tags: ['living', 'nature'],
    resists: { ice: 50 },
    attacks: [{ kind: 'melee', name: '重击', damage: 10, damageType: 'physical' }],
    description: '八百磅重的忠诚意见。',
  },
  {
    id: 'drake_fire', name: '火龙', sprite: 'mon_drake_fire', color: '#ff7a3a',
    maxHP: 45, level: 4, minRealm: 99, flying: true, tags: ['dragon'],
    resists: { fire: 100, ice: -50 },
    attacks: [
      { kind: 'breath', name: '火焰吐息', range: 5, cooldown: 3, damage: 9, damageType: 'fire' },
      { kind: 'melee', name: '利爪', damage: 9, damageType: 'physical' },
    ],
    description: '作为龙算是小个子。但仍然是龙。',
  },
  {
    id: 'drake_ice', name: '冰龙', sprite: 'mon_drake_ice', color: '#7fd8ff',
    maxHP: 45, level: 4, minRealm: 99, flying: true, tags: ['dragon'],
    resists: { ice: 100, fire: -50 },
    attacks: [
      { kind: 'breath', name: '寒霜吐息', range: 5, cooldown: 3, damage: 9, damageType: 'ice' },
      { kind: 'melee', name: '利爪', damage: 9, damageType: 'physical' },
    ],
    description: '寒气抵达之前，它的吐息先让空气起一瞬白雾。',
  },
  {
    id: 'drake_storm', name: '雷龙', sprite: 'mon_drake_storm', color: '#ffe019',
    maxHP: 45, level: 4, minRealm: 99, flying: true, tags: ['dragon'],
    resists: { lightning: 100, ice: -50 },
    attacks: [
      { kind: 'breath', name: '风暴吐息', range: 5, cooldown: 3, damage: 9, damageType: 'lightning' },
      { kind: 'melee', name: '利爪', damage: 9, damageType: 'physical' },
    ],
    description: '长了翅膀、还记着仇的雷。',
  },
  {
    id: 'imp_chaos', name: '混乱小鬼', sprite: 'mon_imp_chaos', color: '#ff5a7a',
    maxHP: 12, level: 2, minRealm: 99, flying: true, tags: ['demon', 'chaos'],
    resists: { fire: 100, dark: 50, holy: -50 },
    attacks: [{ kind: 'bolt', name: '火焰箭', range: 4, damage: 5, damageType: 'fire' }],
    description: '从更糟的地方借来的，而且很快就得还。',
  },
  {
    id: 'skeleton_risen', name: '复苏骷髅', sprite: 'mon_skeleton_risen', color: '#e8e0c8',
    maxHP: 18, level: 2, minRealm: 99, tags: ['undead'],
    resists: { dark: 100, poison: 100, ice: 50, holy: -50 },
    attacks: [{ kind: 'melee', name: '骨爪', damage: 6, damageType: 'physical' }],
    description: '它记得怎么打，却不记得为谁而打。',
  },
  {
    id: 'spider_queen_minion', name: '蛛后', sprite: 'mon_spider_queen_minion', color: '#a8d84a',
    maxHP: 65, level: 5, minRealm: 99, tags: ['spider', 'nature'],
    resists: { poison: 100, ice: -50 },
    attacks: [
      { kind: 'melee', name: '毒牙', damage: 12, damageType: 'poison', buff: 'poisoned', buffDuration: 4, buffPower: 2 },
      { kind: 'summon', name: '产卵', cooldown: 3, startCooldown: 1, summonId: 'spider_lesser', summonCount: 1, color: '#a8d84a' },
    ],
    description: '许多小麻烦的母亲。',
  },
  {
    id: 'spider_lesser', name: '子蛛', sprite: 'mon_spider_lesser', color: '#8ab83a',
    maxHP: 8, level: 1, minRealm: 99, tags: ['spider', 'nature'],
    resists: { poison: 100 },
    attacks: [{ kind: 'melee', name: '啮咬', damage: 4, damageType: 'poison', buff: 'poisoned', buffDuration: 3, buffPower: 1 }],
    description: '蛛群之一。还有更多。',
  },
  {
    id: 'hydra_frostfire', name: '霜火九头蛇', sprite: 'mon_hydra_frostfire', color: '#ff9f7a',
    maxHP: 30, level: 3, minRealm: 99, stationary: true, tags: ['nature', 'elemental'],
    resists: { fire: 100, ice: 100, physical: -50 },
    attacks: [
      { kind: 'breath', name: '火焰吐息', range: 6, cooldown: 2, damage: 9, damageType: 'fire' },
      { kind: 'breath', name: '寒霜吐息', range: 6, cooldown: 2, damage: 9, damageType: 'ice' },
    ],
    description: '在萌发之处扎根。两个头对一切都有分歧，唯独在你身上意见一致。',
  },
  {
    id: 'golem_siege', name: '攻城魔像', sprite: 'mon_golem_siege', color: '#a8b8c8',
    maxHP: 50, level: 4, minRealm: 99, tags: ['construct', 'metallic'],
    resists: { physical: 50, poison: 100, ice: 50, lightning: -50 },
    attacks: [
      { kind: 'bolt', name: '投石', range: 6, minRange: 2, cooldown: 2, damage: 12, damageType: 'physical' },
      { kind: 'melee', name: '砸击', damage: 12, damageType: 'physical' },
    ],
    description: '为拆墙而造。墙、门、攻城器械，还有你。',
  },
]

// --------------------------------------------------------------------- sprites

export const sprites: Record<string, SpriteDef> = {
  mon_wolf: {
    palette: ['#23262e', '#b8c4d4', '#ffd84a'],
    wobble: 0.5,
    shapes: [
      { t: 'line', pts: [0.24, 0.56, 0.06, 0.4], stroke: '$1', w: 0.045 },
      { t: 'ellipse', x: 0.46, y: 0.6, rx: 0.26, ry: 0.15, fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.34, 0.72, 0.32, 0.92], stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.6, 0.72, 0.62, 0.92], stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.6, 0.38, 0.68, 0.22, 0.76, 0.4], fill: '$0', stroke: '$1', w: 0.035 },
      { t: 'poly', pts: [0.58, 0.42, 0.94, 0.52, 0.7, 0.62], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.72, y: 0.48, r: 0.03, fill: '$2' },
    ],
  },
  mon_sentinel_earthen: {
    palette: ['#3a3630', '#a89880', '#8aff9a'],
    wobble: 0.35,
    shapes: [
      { t: 'poly', pts: [0.24, 0.6, 0.76, 0.6, 0.76, 0.92, 0.24, 0.92], fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'poly', pts: [0.3, 0.34, 0.7, 0.34, 0.7, 0.62, 0.3, 0.62], fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'poly', pts: [0.4, 0.34, 0.6, 0.34, 0.57, 0.14, 0.43, 0.14], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.46, y: 0.24, r: 0.032, fill: '$2' },
      { t: 'circle', x: 0.55, y: 0.24, r: 0.032, fill: '$2' },
      { t: 'line', pts: [0.3, 0.5, 0.46, 0.56, 0.68, 0.46], stroke: '$1', w: 0.03 },
      { t: 'line', pts: [0.34, 0.74, 0.52, 0.8, 0.7, 0.72], stroke: '$1', w: 0.03 },
    ],
  },
  mon_bear_giant: {
    palette: ['#3a2a20', '#d8b890', '#ff6a6a'],
    wobble: 0.55,
    shapes: [
      { t: 'blob', x: 0.5, y: 0.62, r: 0.3, lobes: 6, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'circle', x: 0.35, y: 0.2, r: 0.07, fill: '$0', stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.65, y: 0.2, r: 0.07, fill: '$0', stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.5, y: 0.3, r: 0.17, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'ellipse', x: 0.5, y: 0.38, rx: 0.08, ry: 0.05, fill: '$1' },
      { t: 'circle', x: 0.43, y: 0.27, r: 0.026, fill: '$2' },
      { t: 'circle', x: 0.57, y: 0.27, r: 0.026, fill: '$2' },
      { t: 'line', pts: [0.24, 0.82, 0.18, 0.92], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.76, 0.82, 0.82, 0.92], stroke: '$1', w: 0.035 },
    ],
  },
  mon_drake_fire: {
    palette: ['#3a1410', '#ff7a3a', '#ffd0a0'],
    wobble: 0.5,
    shapes: [
      { t: 'poly', pts: [0.48, 0.44, 0.08, 0.16, 0.18, 0.56], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.52, 0.44, 0.92, 0.16, 0.82, 0.56], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'ellipse', x: 0.5, y: 0.6, rx: 0.16, ry: 0.22, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'poly', pts: [0.4, 0.32, 0.6, 0.32, 0.7, 0.18, 0.38, 0.16], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.5, y: 0.24, r: 0.028, fill: '$2' },
      { t: 'line', pts: [0.5, 0.8, 0.66, 0.94], stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.66, 0.94, 0.78, 0.84, 0.8, 0.96], fill: '$1', stroke: '$2', w: 0.02 },
    ],
  },
  mon_drake_ice: {
    palette: ['#10283a', '#7fd8ff', '#e8faff'],
    wobble: 0.45,
    shapes: [
      { t: 'poly', pts: [0.48, 0.44, 0.08, 0.18, 0.2, 0.54], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.52, 0.44, 0.92, 0.18, 0.8, 0.54], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'ellipse', x: 0.5, y: 0.6, rx: 0.16, ry: 0.22, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'poly', pts: [0.4, 0.32, 0.6, 0.32, 0.7, 0.2, 0.38, 0.18], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.42, 0.16, 0.5, 0.02, 0.58, 0.16], fill: '$0', stroke: '$2', w: 0.03 },
      { t: 'circle', x: 0.5, y: 0.26, r: 0.028, fill: '$2' },
      { t: 'line', pts: [0.5, 0.8, 0.68, 0.92], stroke: '$1', w: 0.04 },
    ],
  },
  mon_drake_storm: {
    palette: ['#2a2a12', '#ffe019', '#fff8c0'],
    wobble: 0.55,
    shapes: [
      { t: 'poly', pts: [0.48, 0.44, 0.06, 0.2, 0.16, 0.4, 0.2, 0.56], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.52, 0.44, 0.94, 0.2, 0.84, 0.4, 0.8, 0.56], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'ellipse', x: 0.5, y: 0.6, rx: 0.16, ry: 0.22, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'poly', pts: [0.4, 0.32, 0.6, 0.32, 0.7, 0.18, 0.38, 0.16], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.5, y: 0.24, r: 0.028, fill: '$2' },
      { t: 'line', pts: [0.44, 0.72, 0.56, 0.78, 0.46, 0.86, 0.6, 0.94], stroke: '$2', w: 0.035 },
    ],
  },
  mon_imp_chaos: {
    palette: ['#3a1224', '#ff5a7a', '#ffd84a'],
    wobble: 0.65,
    shapes: [
      { t: 'poly', pts: [0.44, 0.5, 0.1, 0.26, 0.18, 0.6], fill: '$0', stroke: '$1', w: 0.035 },
      { t: 'poly', pts: [0.56, 0.5, 0.9, 0.26, 0.82, 0.6], fill: '$0', stroke: '$1', w: 0.035 },
      { t: 'blob', x: 0.5, y: 0.62, r: 0.19, lobes: 5, fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.5, y: 0.36, r: 0.13, fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.4, 0.26, 0.34, 0.12], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.6, 0.26, 0.66, 0.12], stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.45, y: 0.36, r: 0.028, fill: '$2' },
      { t: 'circle', x: 0.55, y: 0.36, r: 0.028, fill: '$2' },
    ],
  },
  mon_skeleton_risen: {
    palette: ['#26262c', '#e8e0c8', '#ff5a5a'],
    wobble: 0.5,
    shapes: [
      { t: 'circle', x: 0.5, y: 0.28, r: 0.14, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'circle', x: 0.44, y: 0.28, r: 0.032, fill: '$2' },
      { t: 'circle', x: 0.56, y: 0.28, r: 0.032, fill: '$2' },
      { t: 'poly', pts: [0.44, 0.4, 0.56, 0.4, 0.54, 0.46, 0.46, 0.46], fill: '$1' },
      { t: 'line', pts: [0.5, 0.44, 0.5, 0.82], stroke: '$1', w: 0.05 },
      { t: 'line', pts: [0.34, 0.54, 0.66, 0.54], stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.38, 0.66, 0.62, 0.66], stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.5, 0.82, 0.36, 0.94], stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.5, 0.82, 0.64, 0.94], stroke: '$1', w: 0.04 },
    ],
  },
  mon_spider_queen_minion: {
    palette: ['#24301a', '#a8d84a', '#ff4a6a'],
    wobble: 0.55,
    shapes: [
      { t: 'line', pts: [0.4, 0.52, 0.16, 0.34, 0.06, 0.5], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.6, 0.52, 0.84, 0.34, 0.94, 0.5], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.42, 0.62, 0.2, 0.74, 0.12, 0.92], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.58, 0.62, 0.8, 0.74, 0.88, 0.92], stroke: '$1', w: 0.035 },
      { t: 'ellipse', x: 0.5, y: 0.64, rx: 0.24, ry: 0.2, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'circle', x: 0.5, y: 0.36, r: 0.14, fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.36, 0.26, 0.42, 0.12, 0.5, 0.22, 0.58, 0.12, 0.64, 0.26], fill: '$0', stroke: '$2', w: 0.03 },
      { t: 'circle', x: 0.44, y: 0.38, r: 0.03, fill: '$2' },
      { t: 'circle', x: 0.56, y: 0.38, r: 0.03, fill: '$2' },
    ],
  },
  mon_spider_lesser: {
    palette: ['#20280f', '#8ab83a', '#ffd84a'],
    wobble: 0.6,
    shapes: [
      { t: 'line', pts: [0.4, 0.48, 0.2, 0.34, 0.12, 0.48], stroke: '$1', w: 0.03 },
      { t: 'line', pts: [0.6, 0.48, 0.8, 0.34, 0.88, 0.48], stroke: '$1', w: 0.03 },
      { t: 'line', pts: [0.42, 0.6, 0.24, 0.72, 0.18, 0.88], stroke: '$1', w: 0.03 },
      { t: 'line', pts: [0.58, 0.6, 0.76, 0.72, 0.82, 0.88], stroke: '$1', w: 0.03 },
      { t: 'circle', x: 0.5, y: 0.6, r: 0.17, fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.5, y: 0.4, r: 0.1, fill: '$0', stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.46, y: 0.4, r: 0.024, fill: '$2' },
      { t: 'circle', x: 0.55, y: 0.4, r: 0.024, fill: '$2' },
    ],
  },
  mon_hydra_frostfire: {
    palette: ['#241c28', '#ff7a3a', '#7fd8ff', '#c8c8d8'],
    wobble: 0.5,
    shapes: [
      { t: 'blob', x: 0.5, y: 0.78, r: 0.22, lobes: 6, fill: '$0', stroke: '$3', w: 0.045 },
      { t: 'line', pts: [0.44, 0.74, 0.32, 0.52, 0.28, 0.38], stroke: '$1', w: 0.05 },
      { t: 'line', pts: [0.56, 0.74, 0.68, 0.52, 0.72, 0.38], stroke: '$2', w: 0.05 },
      { t: 'circle', x: 0.26, y: 0.28, r: 0.12, fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.74, y: 0.28, r: 0.12, fill: '$0', stroke: '$2', w: 0.04 },
      { t: 'circle', x: 0.28, y: 0.28, r: 0.03, fill: '$1' },
      { t: 'circle', x: 0.72, y: 0.28, r: 0.03, fill: '$2' },
      { t: 'line', pts: [0.34, 0.86, 0.68, 0.88], stroke: '$3', w: 0.03 },
    ],
  },
  mon_golem_siege: {
    palette: ['#22262c', '#a8b8c8', '#ffd84a'],
    wobble: 0.3,
    shapes: [
      { t: 'poly', pts: [0.3, 0.34, 0.7, 0.34, 0.7, 0.68, 0.3, 0.68], fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'poly', pts: [0.41, 0.14, 0.59, 0.14, 0.59, 0.32, 0.41, 0.32], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.5, y: 0.23, r: 0.04, fill: '$2' },
      { t: 'circle', x: 0.19, y: 0.52, r: 0.13, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'circle', x: 0.81, y: 0.52, r: 0.13, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'poly', pts: [0.33, 0.7, 0.46, 0.7, 0.46, 0.92, 0.33, 0.92], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.54, 0.7, 0.67, 0.7, 0.67, 0.92, 0.54, 0.92], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.34, 0.44, 0.66, 0.44], stroke: '$1', w: 0.03 },
    ],
  },

  icon_wolf: {
    palette: ['#1b2620', '#b0ff9a', '#ffd84a'],
    shapes: [
      { t: 'poly', pts: [0.3, 0.38, 0.4, 0.14, 0.5, 0.36], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.58, 0.36, 0.68, 0.14, 0.76, 0.4], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.28, 0.36, 0.78, 0.36, 0.62, 0.82, 0.42, 0.82], fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'circle', x: 0.43, y: 0.5, r: 0.035, fill: '$2' },
      { t: 'circle', x: 0.62, y: 0.5, r: 0.035, fill: '$2' },
      { t: 'poly', pts: [0.44, 0.72, 0.52, 0.92, 0.6, 0.72], fill: '$1' },
    ],
  },
  icon_earthen_sentinel: {
    palette: ['#2c2a24', '#a89880', '#8aff9a'],
    shapes: [
      { t: 'poly', pts: [0.3, 0.9, 0.34, 0.24, 0.5, 0.1, 0.66, 0.24, 0.7, 0.9], fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'circle', x: 0.5, y: 0.42, r: 0.11, fill: '$0', stroke: '$2', w: 0.04 },
      { t: 'circle', x: 0.5, y: 0.42, r: 0.04, fill: '$2' },
      { t: 'line', pts: [0.36, 0.62, 0.5, 0.68, 0.64, 0.6], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.26, 0.9, 0.74, 0.9], stroke: '$1', w: 0.05 },
    ],
  },
  icon_giant_bear: {
    palette: ['#2e2118', '#d8b890', '#ff6a6a'],
    shapes: [
      { t: 'circle', x: 0.32, y: 0.24, r: 0.1, fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.68, y: 0.24, r: 0.1, fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.5, y: 0.5, r: 0.32, fill: '$0', stroke: '$1', w: 0.055 },
      { t: 'ellipse', x: 0.5, y: 0.64, rx: 0.13, ry: 0.09, fill: '$1' },
      { t: 'circle', x: 0.39, y: 0.44, r: 0.04, fill: '$2' },
      { t: 'circle', x: 0.61, y: 0.44, r: 0.04, fill: '$2' },
      { t: 'line', pts: [0.5, 0.62, 0.5, 0.7], stroke: '$0', w: 0.04 },
    ],
  },
  icon_fire_drake: {
    palette: ['#3a1410', '#ff7a3a', '#ffd0a0'],
    shapes: [
      { t: 'blob', x: 0.5, y: 0.56, r: 0.34, lobes: 6, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'poly', pts: [0.3, 0.5, 0.58, 0.5, 0.78, 0.32, 0.28, 0.28], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.44, y: 0.38, r: 0.035, fill: '$2' },
      { t: 'poly', pts: [0.36, 0.62, 0.72, 0.66, 0.4, 0.74], fill: '$1', stroke: '$2', w: 0.02 },
      { t: 'line', pts: [0.28, 0.28, 0.16, 0.16], stroke: '$1', w: 0.04 },
    ],
  },
  icon_ice_drake: {
    palette: ['#10283a', '#7fd8ff', '#e8faff'],
    shapes: [
      { t: 'blob', x: 0.5, y: 0.58, r: 0.32, lobes: 5, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'poly', pts: [0.3, 0.5, 0.58, 0.5, 0.78, 0.34, 0.28, 0.3], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.44, y: 0.4, r: 0.035, fill: '$2' },
      { t: 'poly', pts: [0.3, 0.28, 0.42, 0.06, 0.54, 0.26], fill: '$0', stroke: '$2', w: 0.03 },
      { t: 'line', pts: [0.38, 0.7, 0.7, 0.66], stroke: '$2', w: 0.035 },
    ],
  },
  icon_storm_drake: {
    palette: ['#2a2a12', '#ffe019', '#fff8c0'],
    shapes: [
      { t: 'blob', x: 0.5, y: 0.6, r: 0.3, lobes: 6, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'poly', pts: [0.3, 0.52, 0.58, 0.52, 0.78, 0.36, 0.28, 0.32], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.44, y: 0.42, r: 0.035, fill: '$2' },
      { t: 'line', pts: [0.56, 0.1, 0.44, 0.28, 0.6, 0.26, 0.46, 0.46], stroke: '$1', w: 0.045 },
      { t: 'line', pts: [0.36, 0.74, 0.68, 0.7], stroke: '$2', w: 0.03 },
    ],
  },
  icon_imp_swarm: {
    palette: ['#3a1224', '#ff5a7a', '#ffd84a'],
    shapes: [
      { t: 'circle', x: 0.28, y: 0.66, r: 0.15, fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.72, y: 0.66, r: 0.15, fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.5, y: 0.34, r: 0.18, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'line', pts: [0.4, 0.22, 0.32, 0.08], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.6, 0.22, 0.68, 0.08], stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.44, y: 0.34, r: 0.032, fill: '$2' },
      { t: 'circle', x: 0.56, y: 0.34, r: 0.032, fill: '$2' },
      { t: 'circle', x: 0.28, y: 0.66, r: 0.04, fill: '$2' },
      { t: 'circle', x: 0.72, y: 0.66, r: 0.04, fill: '$2' },
    ],
  },
  icon_the_restless_dead: {
    palette: ['#241a2c', '#c8b8e0', '#a05ad0'],
    shapes: [
      { t: 'arc', x: 0.5, y: 0.92, r: 0.36, a0: 3.34, a1: 6.08, stroke: '$2', w: 0.05 },
      { t: 'circle', x: 0.5, y: 0.42, r: 0.19, fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'circle', x: 0.43, y: 0.4, r: 0.045, fill: '$2' },
      { t: 'circle', x: 0.57, y: 0.4, r: 0.045, fill: '$2' },
      { t: 'poly', pts: [0.42, 0.56, 0.58, 0.56, 0.56, 0.64, 0.44, 0.64], fill: '$1' },
      { t: 'line', pts: [0.2, 0.78, 0.3, 0.62], stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.8, 0.78, 0.7, 0.62], stroke: '$1', w: 0.04 },
    ],
  },
  icon_spider_queen: {
    palette: ['#24301a', '#a8d84a', '#ff4a6a'],
    shapes: [
      { t: 'line', pts: [0.36, 0.5, 0.14, 0.34, 0.06, 0.52], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.64, 0.5, 0.86, 0.34, 0.94, 0.52], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.38, 0.64, 0.18, 0.78, 0.14, 0.94], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.62, 0.64, 0.82, 0.78, 0.86, 0.94], stroke: '$1', w: 0.035 },
      { t: 'ellipse', x: 0.5, y: 0.62, rx: 0.24, ry: 0.22, fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'poly', pts: [0.32, 0.3, 0.4, 0.12, 0.5, 0.24, 0.6, 0.12, 0.68, 0.3], fill: '$0', stroke: '$2', w: 0.035 },
      { t: 'circle', x: 0.44, y: 0.56, r: 0.035, fill: '$2' },
      { t: 'circle', x: 0.56, y: 0.56, r: 0.035, fill: '$2' },
    ],
  },
  icon_frostfire_hydra: {
    palette: ['#241c28', '#ff7a3a', '#7fd8ff', '#c8c8d8'],
    shapes: [
      { t: 'blob', x: 0.5, y: 0.8, r: 0.2, lobes: 6, fill: '$0', stroke: '$3', w: 0.045 },
      { t: 'line', pts: [0.44, 0.76, 0.3, 0.5, 0.26, 0.36], stroke: '$1', w: 0.055 },
      { t: 'line', pts: [0.56, 0.76, 0.7, 0.5, 0.74, 0.36], stroke: '$2', w: 0.055 },
      { t: 'circle', x: 0.24, y: 0.24, r: 0.14, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'circle', x: 0.76, y: 0.24, r: 0.14, fill: '$0', stroke: '$2', w: 0.045 },
      { t: 'circle', x: 0.26, y: 0.24, r: 0.04, fill: '$1' },
      { t: 'circle', x: 0.74, y: 0.24, r: 0.04, fill: '$2' },
    ],
  },
  icon_siege_golems: {
    palette: ['#22262c', '#a8b8c8', '#ffd84a'],
    shapes: [
      { t: 'poly', pts: [0.08, 0.36, 0.42, 0.36, 0.42, 0.86, 0.08, 0.86], fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'poly', pts: [0.52, 0.46, 0.84, 0.46, 0.84, 0.86, 0.52, 0.86], fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'circle', x: 0.25, y: 0.54, r: 0.05, fill: '$2' },
      { t: 'circle', x: 0.68, y: 0.6, r: 0.045, fill: '$2' },
      { t: 'blob', x: 0.7, y: 0.2, r: 0.16, lobes: 6, fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.12, 0.66, 0.4, 0.66], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.56, 0.72, 0.8, 0.72], stroke: '$1', w: 0.03 },
    ],
  },
}
