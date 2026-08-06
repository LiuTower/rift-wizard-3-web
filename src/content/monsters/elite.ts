import type { UnitDef } from '../../core/unit'
import type { SpriteDef } from '../../render/sprite'

/**
 * Elite creatures (level 7-8) and the four realm bosses.
 *
 * Attacks are tried in list order every turn, so each roster puts long-cooldown
 * specials first and the reliable melee last. Summoned escorts live in this file
 * with `weight: 0` so level generation never rolls them directly.
 */

// ------------------------------------------------------------------ elites

const ancientLich: UnitDef = {
  id: 'ancient_lich',
  name: '上古巫妖',
  sprite: 'mon_ancient_lich',
  color: '#c8a0ff',
  maxHP: 260,
  level: 8,
  minRealm: 13,
  tags: ['undead', 'arcane'],
  resists: { dark: 100, poison: 100, ice: 50, physical: 25, holy: -50 },
  attacks: [
    {
      kind: 'summon', name: '召起勇士', summonId: 'bone_knight_elite', summonCount: 1,
      cooldown: 12, startCooldown: 4, color: '#e8e8f0',
    },
    {
      kind: 'burst', name: '黑暗新星', radius: 3, damage: 24, damageType: 'dark',
      cooldown: 5, color: '#a05ad0',
    },
    {
      kind: 'bolt', name: '死亡箭', range: 8, damage: 28, damageType: 'dark',
      cooldown: 2, buff: 'cursed', buffDuration: 4,
    },
    { kind: 'melee', name: '枯萎之握', damage: 20, damageType: 'dark' },
  ],
  description: '它拿肉身换来了时间，又把换来的每一年都花在钻研上。它身上这套骨头，不是第一套。',
}

const boneKnightElite: UnitDef = {
  id: 'bone_knight_elite',
  name: '白骨精锐骑士',
  sprite: 'mon_bone_knight_elite',
  color: '#e8e8f0',
  maxHP: 120,
  level: 6,
  weight: 0,
  shields: 1,
  tags: ['undead', 'metallic'],
  resists: { physical: 50, dark: 100, poison: 100, ice: 25, holy: -50 },
  attacks: [
    {
      kind: 'melee', name: '盾击', damage: 12, damageType: 'physical',
      cooldown: 5, buff: 'stunned', buffDuration: 1,
    },
    { kind: 'melee', name: '巨剑', damage: 24, damageType: 'physical' },
  ],
  description: '主人停下之后，这身板甲还在走。巫妖只需要开口问一声。',
}

const ironDrake: UnitDef = {
  id: 'iron_drake',
  name: '铁龙',
  sprite: 'mon_iron_drake',
  color: '#c8ccd8',
  maxHP: 300,
  level: 8,
  minRealm: 12,
  flying: true,
  tags: ['dragon', 'metallic'],
  resists: { physical: 50, fire: 100, poison: 100, lightning: 25, ice: -50 },
  attacks: [
    {
      kind: 'breath', name: '熔炉吐息', range: 6, damage: 26, damageType: 'fire',
      cooldown: 4, buff: 'burning', buffDuration: 3, color: '#ff8f5a',
    },
    {
      kind: 'push', name: '尾扫', radius: 3, damage: 16, damageType: 'physical',
      cooldown: 5,
    },
    { kind: 'melee', name: '剪咬', damage: 36, damageType: 'physical' },
  ],
  description: '一座熔炉，外面包着锻打成片的鳞甲。低温会让金属变脆。',
}

const voidMaw: UnitDef = {
  id: 'void_maw',
  name: '虚空巨口',
  sprite: 'mon_void_maw',
  color: '#ff5cc8',
  maxHP: 200,
  level: 7,
  minRealm: 11,
  flying: true,
  tags: ['arcane'],
  resists: { arcane: 100, dark: 50, physical: 25, holy: -50 },
  attacks: [
    {
      kind: 'pull', name: '重力井', range: 6, minRange: 2, radius: 4,
      cooldown: 3, color: '#ff5cc8',
    },
    {
      kind: 'bolt', name: '虚空鞭击', range: 5, damage: 22, damageType: 'arcane',
      cooldown: 2,
    },
    { kind: 'melee', name: '吞噬', damage: 32, damageType: 'arcane' },
  ],
  description: '一个长着牙的洞。在它旁边站着不动，跟待在原地不是一回事。',
}

const chaosHydra: UnitDef = {
  id: 'chaos_hydra',
  name: '混乱九头蛇',
  sprite: 'mon_chaos_hydra',
  color: '#b0ff9a',
  maxHP: 320,
  level: 8,
  minRealm: 13,
  big: true,
  tags: ['chaos', 'dragon'],
  resists: { fire: 50, lightning: 50, ice: 50, poison: 50, holy: -25 },
  attacks: [
    {
      kind: 'breath', name: '余烬之首', range: 5, damage: 24, damageType: 'fire',
      cooldown: 3, buff: 'burning', buffDuration: 3, color: '#ff5219',
    },
    {
      kind: 'breath', name: '风暴之首', range: 5, damage: 24, damageType: 'lightning',
      cooldown: 4, buff: 'conductance', buffDuration: 3, color: '#ffe019',
    },
    {
      kind: 'breath', name: '剧毒之首', range: 5, damage: 20, damageType: 'poison',
      cooldown: 3, buff: 'poisoned', buffDuration: 4, buffPower: 4, color: '#8ad04a',
    },
    { kind: 'melee', name: '三口齐咬', damage: 32, damageType: 'physical' },
  ],
  description: '三条脖子从没在该用哪种元素上谈拢过。但它们都愿意在你身上各让一步。',
}

const seraph: UnitDef = {
  id: 'seraph',
  name: '智天使',
  sprite: 'mon_seraph',
  color: '#fff5b0',
  maxHP: 190,
  level: 7,
  minRealm: 11,
  flying: true,
  shields: 1,
  tags: ['holy'],
  resists: { holy: 100, fire: 25, physical: 25, dark: -50 },
  attacks: [
    {
      kind: 'heal_allies', name: '祝祷', heal: 30, radius: 5, cooldown: 5,
    },
    {
      kind: 'blast', name: '炫目圣光', range: 6, radius: 2, damage: 22, damageType: 'holy',
      cooldown: 4, buff: 'blind', buffDuration: 1, color: '#fff5b0',
    },
    {
      kind: 'bolt', name: '裁决', range: 6, damage: 26, damageType: 'holy', cooldown: 2,
    },
    { kind: 'melee', name: '燃焰之剑', damage: 24, damageType: 'holy' },
  ],
  description: '六翼，无面，只有一种意见。它放出光之前，把脸转开。',
}

const demonPrince: UnitDef = {
  id: 'demon_prince',
  name: '恶魔亲王',
  sprite: 'mon_demon_prince',
  color: '#ff8f5a',
  maxHP: 290,
  level: 8,
  minRealm: 12,
  tags: ['demon'],
  resists: { fire: 100, dark: 75, physical: 25, ice: -25, holy: -50 },
  passives: ['flame_aura'],
  attacks: [
    {
      kind: 'summon', name: '召集廷臣', summonId: 'imp_greater', summonCount: 1,
      cooldown: 11, startCooldown: 4, color: '#ff8f5a',
    },
    {
      kind: 'blast', name: '地狱火', range: 6, radius: 2, damage: 26, damageType: 'fire',
      cooldown: 4, buff: 'burning', buffDuration: 3, color: '#ff5219',
    },
    { kind: 'melee', name: '裂魂刃', damage: 34, damageType: 'dark' },
  ],
  description: '有爵位，有封地，还在烧。凑近它的东西，都会被它周身的空气烤熟。',
}

const impGreater: UnitDef = {
  id: 'imp_greater',
  name: '魔将小鬼',
  sprite: 'mon_imp_greater',
  color: '#ffb03a',
  maxHP: 70,
  level: 5,
  weight: 0,
  flying: true,
  tags: ['demon'],
  resists: { fire: 100, dark: 25, holy: -50, ice: -25 },
  attacks: [
    { kind: 'bolt', name: '火焰箭', range: 5, damage: 15, damageType: 'fire', cooldown: 1 },
    { kind: 'melee', name: '抓挠', damage: 12, damageType: 'fire' },
  ],
  description: '廷前家臣。比寻常小鬼大一号，也为此得意两倍。',
}

const titan: UnitDef = {
  id: 'titan',
  name: '泰坦巨人',
  sprite: 'mon_titan',
  color: '#c8ccd8',
  maxHP: 350,
  level: 8,
  minRealm: 14,
  big: true,
  shields: 1,
  tags: ['living', 'construct'],
  resists: { physical: 50, ice: 50, poison: 100, lightning: 25, arcane: -25 },
  attacks: [
    {
      kind: 'blast', name: '震地猛击', telegraph: true, range: 6, radius: 3,
      damage: 34, damageType: 'physical', cooldown: 5, color: '#c8ccd8',
    },
    {
      kind: 'push', name: '横扫铁拳', radius: 3, damage: 18, damageType: 'physical',
      cooldown: 4,
    },
    { kind: 'melee', name: '碾碎', damage: 38, damageType: 'physical' },
  ],
  description: '是从石场里凿出来的，不是生出来的。它举起双拳时，周围三格的地面就已经有主了。',
}

// ------------------------------------------------------------------ bosses

const bossSlazephan: UnitDef = {
  id: 'boss_slazephan',
  name: '诡辩之蛇斯拉泽法',
  sprite: 'mon_boss_slazephan',
  color: '#8ad04a',
  maxHP: 250,
  level: 9,
  weight: 0,
  big: true,
  tags: ['boss', 'nature', 'arcane', 'living'],
  resists: { poison: 100, arcane: 50, physical: 25, ice: -50 },
  attacks: [
    {
      kind: 'debuff', name: '石化论证', range: 7, damage: 8, damageType: 'arcane',
      cooldown: 8, buff: 'petrified', buffDuration: 1, color: '#b0a898',
    },
    {
      kind: 'summon', name: '盘绕子嗣', summonId: 'serpent_coil', summonCount: 1,
      cooldown: 12, startCooldown: 3, color: '#8ad04a',
    },
    {
      kind: 'breath', name: '疑云瘴气', range: 6, damage: 12, damageType: 'poison',
      cooldown: 4, buff: 'poisoned', buffDuration: 5, buffPower: 2, color: '#8ad04a',
    },
    {
      kind: 'bolt', name: '奥术箴言', range: 8, damage: 18, damageType: 'arcane',
      cooldown: 2,
    },
    { kind: 'melee', name: '绞杀', damage: 25, damageType: 'physical' },
  ],
  description: '一条长如桥梁的巨蛇，盘绕在它吞下的那座图书馆里。九个世纪以来，它一直在打磨一篇论证——论证你不该存在——现在它想念给你听。',
}

const serpentCoil: UnitDef = {
  id: 'serpent_coil',
  name: '蛇之盘绕',
  sprite: 'mon_serpent_coil',
  color: '#8ad04a',
  maxHP: 55,
  level: 4,
  weight: 0,
  tags: ['nature', 'living'],
  resists: { poison: 100, physical: 25, ice: -50 },
  attacks: [
    {
      kind: 'melee', name: '盘绕', damage: 10, damageType: 'physical',
      cooldown: 3, buff: 'rooted', buffDuration: 2,
    },
    {
      kind: 'melee', name: '毒牙', damage: 14, damageType: 'poison',
      buff: 'poisoned', buffDuration: 3, buffPower: 2,
    },
  ],
  description: '从本体上蜕下的一截，仍在猎食。',
}

const bossGaia: UnitDef = {
  id: 'boss_gaia',
  name: '盖亚',
  sprite: 'mon_boss_gaia',
  color: '#5ad04a',
  maxHP: 420,
  level: 9,
  weight: 0,
  big: true,
  tags: ['boss', 'nature', 'living'],
  resists: { poison: 100, physical: 50, ice: 25, lightning: 25, fire: -50 },
  attacks: [
    {
      kind: 'summon', name: '唤醒林野', summonId: 'treant_guardian', summonCount: 1,
      cooldown: 14, startCooldown: 3, color: '#5ad04a',
    },
    {
      kind: 'heal_allies', name: '碧绿回春', heal: 30, radius: 3, cooldown: 9,
    },
    {
      // a 3-turn root every 3 turns is a permanent stunlock; leave the wizard room to move
      kind: 'debuff', name: '缠绕之根', range: 8, damage: 12, damageType: 'physical',
      cooldown: 6, buff: 'rooted', buffDuration: 2, color: '#5ad04a',
    },
    {
      kind: 'blast', name: '荒野之怒', range: 7, radius: 3, damage: 26,
      damageType: 'poison', cooldown: 4, buff: 'poisoned', buffDuration: 4, buffPower: 3,
      color: '#8ad04a',
    },
    { kind: 'melee', name: '摧裂巨枝', damage: 30, damageType: 'physical' },
  ],
  description: '这片领域的泥土站了起来，还长出一张脸。地面下每一条根都听她号令；你砸开的伤口，她合得比你砸得更快；而她从没原谅过任何一把斧子。',
}

const treantGuardian: UnitDef = {
  id: 'treant_guardian',
  name: '守林树人',
  sprite: 'mon_treant_guardian',
  color: '#5ad04a',
  maxHP: 140,
  level: 6,
  weight: 0,
  tags: ['nature', 'living'],
  resists: { poison: 100, physical: 50, ice: 25, fire: -75 },
  attacks: [
    {
      kind: 'push', name: '树根掀涌', radius: 2, damage: 14, damageType: 'physical',
      cooldown: 4,
    },
    { kind: 'melee', name: '巨枝砸击', damage: 24, damageType: 'physical' },
  ],
  description: '心怀旧怨的老树。火是它唯一听得懂的论据。',
}

const bossVoidElder: UnitDef = {
  id: 'boss_void_elder',
  name: '虚空古神',
  sprite: 'mon_boss_void_elder',
  color: '#ff5cc8',
  maxHP: 540,
  level: 9,
  weight: 0,
  big: true,
  flying: true,
  shields: 1,
  tags: ['boss', 'arcane', 'eye'],
  resists: { arcane: 100, dark: 50, physical: 25, ice: 25, holy: -25 },
  attacks: [
    {
      kind: 'blast', name: '解构', range: 7, radius: 3, damage: 24, damageType: 'arcane',
      cooldown: 6, buff: 'cursed', buffDuration: 5, color: '#ff5cc8',
    },
    {
      kind: 'beam', name: '外暗凝视', range: 10, damage: 20, damageType: 'arcane',
      cooldown: 3, color: '#c8a0ff',
    },
    {
      kind: 'summon', name: '虚空分裂', summonId: 'void_spawn', summonCount: 2,
      cooldown: 12, startCooldown: 3, color: '#ff5cc8',
    },
    {
      kind: 'teleport', name: '折叠空间', range: 12, minRange: 5, cooldown: 6,
      requiresLOS: false, color: '#ff5cc8',
    },
    { kind: 'melee', name: '撕裂现实', damage: 24, damageType: 'arcane' },
  ],
  description: '一只大如城门的眼睛，透过世界表皮上的裂口向外看。它注视之处，距离不再有任何意义——而它早就看到你了。',
}

const voidSpawn: UnitDef = {
  id: 'void_spawn',
  name: '虚空子嗣',
  sprite: 'mon_void_spawn',
  color: '#c8a0ff',
  maxHP: 50,
  level: 4,
  weight: 0,
  flying: true,
  tags: ['arcane', 'eye'],
  resists: { arcane: 100, dark: 25, holy: -50 },
  attacks: [
    { kind: 'bolt', name: '微尘', range: 4, damage: 8, damageType: 'arcane', cooldown: 3 },
    { kind: 'melee', name: '啃咬', damage: 14, damageType: 'arcane' },
  ],
  description: '古神的一次眨眼，分芽而出，饥饿难当。',
}

const bossMordred: UnitDef = {
  id: 'boss_mordred',
  name: '莫德雷德',
  sprite: 'mon_boss_mordred',
  color: '#a05ad0',
  maxHP: 540,
  level: 9,
  weight: 0,
  big: true,
  shields: 2,
  tags: ['boss', 'chaos', 'arcane'],
  resists: { dark: 100, fire: 50, lightning: 50, physical: 25, holy: -50 },
  attacks: [
    {
      kind: 'blast', name: '裂隙天灾', telegraph: true, range: 10, radius: 4,
      damage: 32, damageType: 'dark', cooldown: 7, color: '#a05ad0',
    },
    {
      kind: 'debuff', name: '厄运之言', range: 10, damage: 10, damageType: 'dark',
      cooldown: 5, buff: 'doomed', buffDuration: 4, buffPower: 30, color: '#d02b3a',
    },
    {
      kind: 'summon', name: '起来，我的鬼卒', summonId: 'wraith_of_mordred', summonCount: 2,
      cooldown: 15, startCooldown: 4, color: '#a05ad0',
    },
    {
      kind: 'buff_allies', name: '恐惧叙任', radius: 6, buff: 'enchanted',
      buffDuration: 8, buffPower: 4, cooldown: 7, startCooldown: 5, color: '#ff5cc8',
    },
    {
      kind: 'bolt', name: '苦难之链', range: 12, damage: 22, damageType: 'dark', cooldown: 2,
    },
  ],
  description: '另一个不肯好好死掉的巫师。他行走裂隙的年头，比你的记忆能追溯到的更久；他在你已经忘却的每一世里都排练过这场会面；而神圣之光，是他唯一没学会一笑置之的东西。',
}

const wraithOfMordred: UnitDef = {
  id: 'wraith_of_mordred',
  name: '莫德雷德之怨灵',
  sprite: 'mon_wraith_of_mordred',
  color: '#a05ad0',
  maxHP: 120,
  level: 6,
  weight: 0,
  flying: true,
  tags: ['undead'],
  resists: { dark: 100, poison: 100, physical: 50, ice: 25, holy: -50 },
  attacks: [
    {
      kind: 'bolt', name: '墓中低语', range: 5, damage: 14, damageType: 'dark',
      cooldown: 2,
    },
    {
      kind: 'melee', name: '撕魂', damage: 20, damageType: 'dark',
      buff: 'cursed', buffDuration: 2,
    },
  ],
  description: '在你之前被他留在此地的巫师之一。它也不记得自己的名字了。',
}

export const units: UnitDef[] = [
  ancientLich, boneKnightElite, ironDrake, voidMaw, chaosHydra,
  seraph, demonPrince, impGreater, titan,
  bossSlazephan, serpentCoil,
  bossGaia, treantGuardian,
  bossVoidElder, voidSpawn,
  bossMordred, wraithOfMordred,
]

// ------------------------------------------------------------------ sprites

export const sprites: Record<string, SpriteDef> = {
  mon_ancient_lich: {
    palette: ['#241636', '#d8b0ff', '#a05ad0', '#66ff88'],
    wobble: 0.5,
    shapes: [
      { t: 'line', pts: [0.8, 0.22, 0.72, 0.94], stroke: '#6a5a4a', w: 0.05 },
      { t: 'circle', x: 0.81, y: 0.17, r: 0.07, fill: '$3', stroke: '$1', w: 0.03 },
      { t: 'poly', pts: [0.5, 0.34, 0.74, 0.94, 0.26, 0.94], fill: '$0', stroke: '$2', w: 0.05 },
      { t: 'line', pts: [0.38, 0.62, 0.62, 0.62], stroke: '$1', w: 0.03 },
      { t: 'line', pts: [0.4, 0.72, 0.6, 0.72], stroke: '$1', w: 0.03 },
      { t: 'circle', x: 0.5, y: 0.28, r: 0.12, fill: '#e8e4d8', stroke: '$2', w: 0.035 },
      { t: 'poly', pts: [0.34, 0.2, 0.42, 0.06, 0.5, 0.16, 0.58, 0.06, 0.66, 0.2], fill: '$2', stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.45, y: 0.29, r: 0.026, fill: '$3' },
      { t: 'circle', x: 0.56, y: 0.29, r: 0.026, fill: '$3' },
    ],
  },

  mon_bone_knight_elite: {
    palette: ['#33333e', '#e8e8f0', '#8890a0', '#ff5a5a'],
    wobble: 0.4,
    shapes: [
      { t: 'line', pts: [0.78, 0.9, 0.7, 0.12], stroke: '$2', w: 0.06 },
      { t: 'line', pts: [0.6, 0.3, 0.82, 0.3], stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.5, 0.32, 0.72, 0.44, 0.66, 0.92, 0.34, 0.92, 0.28, 0.44], fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'poly', pts: [0.5, 0.1, 0.64, 0.22, 0.6, 0.36, 0.4, 0.36, 0.36, 0.22], fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'line', pts: [0.41, 0.26, 0.59, 0.26], stroke: '#101018', w: 0.05 },
      { t: 'circle', x: 0.45, y: 0.26, r: 0.02, fill: '$3' },
      { t: 'circle', x: 0.55, y: 0.26, r: 0.02, fill: '$3' },
      { t: 'line', pts: [0.34, 0.56, 0.66, 0.56], stroke: '$2', w: 0.035 },
    ],
  },

  mon_iron_drake: {
    palette: ['#26262f', '#c8ccd8', '#ff8f5a', '#ffd84a'],
    wobble: 0.45,
    shapes: [
      { t: 'poly', pts: [0.46, 0.4, 0.1, 0.14, 0.2, 0.52], fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'poly', pts: [0.56, 0.4, 0.92, 0.14, 0.84, 0.54], fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'ellipse', x: 0.5, y: 0.58, rx: 0.2, ry: 0.16, fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'poly', pts: [0.42, 0.46, 0.34, 0.24, 0.16, 0.3, 0.32, 0.34, 0.38, 0.5], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.2, 0.3, 0.06, 0.34], stroke: '$2', w: 0.045 },
      { t: 'circle', x: 0.3, y: 0.27, r: 0.022, fill: '$3' },
      { t: 'line', pts: [0.66, 0.62, 0.86, 0.8, 0.72, 0.92], stroke: '$1', w: 0.045 },
      { t: 'line', pts: [0.42, 0.72, 0.4, 0.92], stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.58, 0.72, 0.6, 0.92], stroke: '$1', w: 0.04 },
    ],
  },

  mon_void_maw: {
    palette: ['#1a1030', '#ff5cc8', '#c8a0ff'],
    wobble: 0.7,
    shapes: [
      { t: 'blob', x: 0.5, y: 0.5, r: 0.36, lobes: 7, fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'circle', x: 0.5, y: 0.5, r: 0.2, fill: '#08040e', stroke: '$2', w: 0.035 },
      { t: 'poly', pts: [0.32, 0.44, 0.4, 0.5, 0.32, 0.56, 0.42, 0.62, 0.5, 0.54, 0.58, 0.62, 0.68, 0.56, 0.6, 0.5, 0.68, 0.44], stroke: '$1', w: 0.03, open: true },
      { t: 'line', pts: [0.5, 0.14, 0.44, 0.02], stroke: '$2', w: 0.035 },
      { t: 'line', pts: [0.82, 0.4, 0.96, 0.3], stroke: '$2', w: 0.035 },
      { t: 'line', pts: [0.2, 0.66, 0.06, 0.78], stroke: '$2', w: 0.035 },
      { t: 'circle', x: 0.38, y: 0.34, r: 0.028, fill: '$1' },
      { t: 'circle', x: 0.63, y: 0.35, r: 0.022, fill: '$1' },
    ],
  },

  mon_chaos_hydra: {
    palette: ['#1e2c18', '#b0ff9a', '#ff5219', '#ffe019'],
    wobble: 0.55,
    big: true,
    shapes: [
      { t: 'ellipse', x: 0.5, y: 0.74, rx: 0.26, ry: 0.18, fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'line', pts: [0.4, 0.66, 0.24, 0.42, 0.18, 0.24], stroke: '$1', w: 0.055 },
      { t: 'line', pts: [0.5, 0.62, 0.5, 0.34, 0.5, 0.2], stroke: '$1', w: 0.055 },
      { t: 'line', pts: [0.6, 0.66, 0.76, 0.42, 0.82, 0.24], stroke: '$1', w: 0.055 },
      { t: 'poly', pts: [0.18, 0.22, 0.08, 0.14, 0.2, 0.06, 0.28, 0.16], fill: '$2', stroke: '$1', w: 0.035 },
      { t: 'poly', pts: [0.5, 0.18, 0.4, 0.08, 0.5, 0.02, 0.6, 0.1], fill: '$3', stroke: '$1', w: 0.035 },
      { t: 'poly', pts: [0.82, 0.22, 0.92, 0.14, 0.8, 0.06, 0.72, 0.16], fill: '$1', stroke: '$3', w: 0.035 },
      { t: 'line', pts: [0.74, 0.84, 0.92, 0.92], stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.36, 0.88, 0.32, 0.98], stroke: '$1', w: 0.04 },
    ],
  },

  mon_seraph: {
    palette: ['#3a3624', '#fff5b0', '#ffd84a', '#ffffff'],
    wobble: 0.4,
    shapes: [
      { t: 'poly', pts: [0.44, 0.4, 0.06, 0.2, 0.14, 0.62, 0.4, 0.56], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.56, 0.4, 0.94, 0.2, 0.86, 0.62, 0.6, 0.56], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.5, 0.3, 0.66, 0.92, 0.34, 0.92], fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'circle', x: 0.5, y: 0.26, r: 0.1, fill: '$0', stroke: '$1', w: 0.035 },
      { t: 'arc', x: 0.5, y: 0.16, r: 0.15, a0: 3.34, a1: 6.08, stroke: '$2', w: 0.04 },
      { t: 'line', pts: [0.72, 0.9, 0.66, 0.18], stroke: '$3', w: 0.035 },
      { t: 'circle', x: 0.45, y: 0.26, r: 0.022, fill: '$2' },
      { t: 'circle', x: 0.56, y: 0.26, r: 0.022, fill: '$2' },
    ],
  },

  mon_demon_prince: {
    palette: ['#3a0e12', '#ff8f5a', '#ffd84a', '#d02b3a'],
    wobble: 0.5,
    shapes: [
      { t: 'poly', pts: [0.44, 0.42, 0.08, 0.24, 0.18, 0.6], fill: '$0', stroke: '$3', w: 0.04 },
      { t: 'poly', pts: [0.56, 0.42, 0.92, 0.24, 0.82, 0.6], fill: '$0', stroke: '$3', w: 0.04 },
      { t: 'poly', pts: [0.5, 0.32, 0.7, 0.5, 0.64, 0.92, 0.36, 0.92, 0.3, 0.5], fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'circle', x: 0.5, y: 0.24, r: 0.11, fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.4, 0.16, 0.28, 0.02, 0.44, 0.1], fill: '$1', stroke: '$2', w: 0.03 },
      { t: 'poly', pts: [0.6, 0.16, 0.72, 0.02, 0.56, 0.1], fill: '$1', stroke: '$2', w: 0.03 },
      { t: 'circle', x: 0.45, y: 0.25, r: 0.025, fill: '$2' },
      { t: 'circle', x: 0.56, y: 0.25, r: 0.025, fill: '$2' },
      { t: 'line', pts: [0.74, 0.44, 0.86, 0.86], stroke: '$2', w: 0.045 },
    ],
  },

  mon_imp_greater: {
    palette: ['#3a1408', '#ffb03a', '#ffe019'],
    wobble: 0.6,
    shapes: [
      { t: 'poly', pts: [0.4, 0.44, 0.12, 0.28, 0.2, 0.58], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.6, 0.44, 0.88, 0.28, 0.8, 0.58], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'blob', x: 0.5, y: 0.56, r: 0.22, lobes: 5, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'circle', x: 0.5, y: 0.3, r: 0.13, fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.4, 0.2, 0.32, 0.06, 0.46, 0.16], fill: '$1', stroke: '$2', w: 0.025 },
      { t: 'poly', pts: [0.6, 0.2, 0.68, 0.06, 0.54, 0.16], fill: '$1', stroke: '$2', w: 0.025 },
      { t: 'circle', x: 0.45, y: 0.3, r: 0.028, fill: '$2' },
      { t: 'circle', x: 0.57, y: 0.3, r: 0.028, fill: '$2' },
      { t: 'line', pts: [0.6, 0.74, 0.82, 0.86, 0.76, 0.94], stroke: '$1', w: 0.03 },
    ],
  },

  mon_titan: {
    palette: ['#2b2b30', '#c8ccd8', '#8ad0ff'],
    wobble: 0.35,
    big: true,
    shapes: [
      { t: 'poly', pts: [0.5, 0.24, 0.84, 0.4, 0.76, 0.72, 0.24, 0.72, 0.16, 0.4], fill: '$0', stroke: '$1', w: 0.055 },
      { t: 'poly', pts: [0.42, 0.1, 0.58, 0.1, 0.62, 0.26, 0.38, 0.26], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.14, y: 0.66, r: 0.14, fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'circle', x: 0.86, y: 0.66, r: 0.14, fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'poly', pts: [0.34, 0.74, 0.44, 0.74, 0.42, 0.96, 0.3, 0.96], fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'poly', pts: [0.56, 0.74, 0.66, 0.74, 0.7, 0.96, 0.58, 0.96], fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'line', pts: [0.34, 0.38, 0.5, 0.5, 0.4, 0.62, 0.56, 0.68], stroke: '$2', w: 0.035 },
      { t: 'circle', x: 0.44, y: 0.19, r: 0.024, fill: '$2' },
      { t: 'circle', x: 0.56, y: 0.19, r: 0.024, fill: '$2' },
    ],
  },

  mon_boss_slazephan: {
    palette: ['#1e3018', '#8ad04a', '#b0ff9a', '#ffe019'],
    wobble: 0.5,
    big: true,
    shapes: [
      { t: 'arc', x: 0.44, y: 0.74, r: 0.3, a0: 0.1, a1: 5.6, stroke: '$1', w: 0.11 },
      { t: 'arc', x: 0.44, y: 0.74, r: 0.18, a0: 0.5, a1: 5.2, stroke: '$0', w: 0.09 },
      { t: 'line', pts: [0.62, 0.56, 0.68, 0.38, 0.6, 0.24], stroke: '$1', w: 0.1 },
      { t: 'poly', pts: [0.6, 0.26, 0.44, 0.2, 0.4, 0.1, 0.56, 0.04, 0.72, 0.1, 0.72, 0.22], fill: '$0', stroke: '$2', w: 0.045 },
      { t: 'poly', pts: [0.6, 0.3, 0.34, 0.34, 0.42, 0.16], fill: '$0', stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.5, y: 0.13, r: 0.055, fill: '#08100a', stroke: '$3', w: 0.03 },
      { t: 'circle', x: 0.66, y: 0.12, r: 0.055, fill: '#08100a', stroke: '$3', w: 0.03 },
      { t: 'line', pts: [0.555, 0.13, 0.605, 0.125], stroke: '$3', w: 0.025 },
      { t: 'circle', x: 0.5, y: 0.13, r: 0.02, fill: '$3' },
      { t: 'line', pts: [0.42, 0.1, 0.28, 0.06, 0.34, 0.12, 0.26, 0.14], stroke: '$2', w: 0.025 },
      { t: 'line', pts: [0.2, 0.86, 0.08, 0.94], stroke: '$1', w: 0.05 },
    ],
  },

  mon_serpent_coil: {
    palette: ['#22381a', '#8ad04a', '#ffe019'],
    wobble: 0.6,
    shapes: [
      { t: 'arc', x: 0.46, y: 0.68, r: 0.24, a0: 0.2, a1: 5.4, stroke: '$1', w: 0.09 },
      { t: 'arc', x: 0.46, y: 0.68, r: 0.12, a0: 0.6, a1: 5.0, stroke: '$0', w: 0.06 },
      { t: 'poly', pts: [0.6, 0.46, 0.46, 0.34, 0.56, 0.24, 0.7, 0.32], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.6, y: 0.32, r: 0.026, fill: '$2' },
      { t: 'line', pts: [0.5, 0.3, 0.38, 0.24, 0.44, 0.3, 0.36, 0.32], stroke: '$1', w: 0.025 },
      { t: 'line', pts: [0.22, 0.82, 0.1, 0.9], stroke: '$1', w: 0.04 },
    ],
  },

  mon_boss_gaia: {
    palette: ['#1c2a16', '#5ad04a', '#b0ff9a', '#8a6a4a', '#66ff88'],
    wobble: 0.55,
    big: true,
    shapes: [
      { t: 'poly', pts: [0.5, 0.22, 0.72, 0.46, 0.68, 0.9, 0.32, 0.9, 0.28, 0.46], fill: '$0', stroke: '$3', w: 0.055 },
      { t: 'line', pts: [0.36, 0.9, 0.2, 0.98], stroke: '$3', w: 0.05 },
      { t: 'line', pts: [0.64, 0.9, 0.82, 0.98], stroke: '$3', w: 0.05 },
      { t: 'line', pts: [0.3, 0.5, 0.08, 0.62, 0.12, 0.78], stroke: '$3', w: 0.045 },
      { t: 'line', pts: [0.7, 0.5, 0.92, 0.62, 0.88, 0.78], stroke: '$3', w: 0.045 },
      { t: 'poly', pts: [0.5, 0.06, 0.36, 0.14, 0.4, 0.28, 0.6, 0.28, 0.64, 0.14], fill: '$0', stroke: '$2', w: 0.045 },
      { t: 'line', pts: [0.38, 0.14, 0.24, 0.02], stroke: '$3', w: 0.04 },
      { t: 'line', pts: [0.62, 0.14, 0.76, 0.02], stroke: '$3', w: 0.04 },
      { t: 'blob', x: 0.2, y: 0.24, r: 0.11, lobes: 6, fill: '$1', stroke: '$2', w: 0.03 },
      { t: 'blob', x: 0.8, y: 0.24, r: 0.11, lobes: 6, fill: '$1', stroke: '$2', w: 0.03 },
      { t: 'circle', x: 0.5, y: 0.58, r: 0.09, fill: '$4', stroke: '$2', w: 0.03 },
      { t: 'circle', x: 0.45, y: 0.19, r: 0.026, fill: '$4' },
      { t: 'circle', x: 0.56, y: 0.19, r: 0.026, fill: '$4' },
    ],
  },

  mon_treant_guardian: {
    palette: ['#22301a', '#5ad04a', '#8a6a4a', '#b0ff9a'],
    wobble: 0.55,
    shapes: [
      { t: 'poly', pts: [0.5, 0.28, 0.68, 0.5, 0.64, 0.92, 0.36, 0.92, 0.32, 0.5], fill: '$0', stroke: '$2', w: 0.05 },
      { t: 'line', pts: [0.34, 0.52, 0.12, 0.66, 0.18, 0.8], stroke: '$2', w: 0.05 },
      { t: 'line', pts: [0.66, 0.52, 0.88, 0.66, 0.82, 0.8], stroke: '$2', w: 0.05 },
      { t: 'blob', x: 0.5, y: 0.2, r: 0.2, lobes: 6, fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.38, 0.92, 0.28, 0.99], stroke: '$2', w: 0.04 },
      { t: 'line', pts: [0.62, 0.92, 0.72, 0.99], stroke: '$2', w: 0.04 },
      { t: 'circle', x: 0.44, y: 0.22, r: 0.026, fill: '$3' },
      { t: 'circle', x: 0.57, y: 0.22, r: 0.026, fill: '$3' },
    ],
  },

  mon_boss_void_elder: {
    palette: ['#150a24', '#ff5cc8', '#c8a0ff', '#ffffff'],
    wobble: 0.65,
    big: true,
    shapes: [
      { t: 'blob', x: 0.5, y: 0.48, r: 0.38, lobes: 8, fill: '$0', stroke: '$1', w: 0.055 },
      { t: 'circle', x: 0.5, y: 0.46, r: 0.24, fill: '#f0e4ff', stroke: '$2', w: 0.04 },
      { t: 'circle', x: 0.5, y: 0.46, r: 0.14, fill: '$1', stroke: '$0', w: 0.03 },
      { t: 'circle', x: 0.5, y: 0.46, r: 0.06, fill: '#08040e' },
      { t: 'circle', x: 0.43, y: 0.39, r: 0.032, fill: '$3' },
      { t: 'arc', x: 0.5, y: 0.48, r: 0.44, a0: 2.6, a1: 6.6, stroke: '$2', w: 0.03 },
      { t: 'line', pts: [0.24, 0.78, 0.12, 0.96], stroke: '$1', w: 0.045 },
      { t: 'line', pts: [0.5, 0.86, 0.5, 0.99], stroke: '$1', w: 0.045 },
      { t: 'line', pts: [0.76, 0.78, 0.9, 0.96], stroke: '$1', w: 0.045 },
      { t: 'line', pts: [0.2, 0.16, 0.06, 0.04], stroke: '$2', w: 0.035 },
      { t: 'line', pts: [0.8, 0.16, 0.94, 0.04], stroke: '$2', w: 0.035 },
    ],
  },

  mon_void_spawn: {
    palette: ['#150a24', '#c8a0ff', '#ff5cc8'],
    wobble: 0.7,
    shapes: [
      { t: 'blob', x: 0.5, y: 0.5, r: 0.28, lobes: 7, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'circle', x: 0.5, y: 0.48, r: 0.14, fill: '#f0e4ff', stroke: '$2', w: 0.03 },
      { t: 'circle', x: 0.5, y: 0.48, r: 0.06, fill: '#08040e' },
      { t: 'line', pts: [0.32, 0.72, 0.22, 0.9], stroke: '$2', w: 0.035 },
      { t: 'line', pts: [0.66, 0.72, 0.76, 0.9], stroke: '$2', w: 0.035 },
      { t: 'circle', x: 0.44, y: 0.43, r: 0.022, fill: '#ffffff' },
    ],
  },

  mon_boss_mordred: {
    palette: ['#170f26', '#a05ad0', '#d8b0ff', '#ff5cc8', '#d02b3a'],
    wobble: 0.5,
    big: true,
    shapes: [
      { t: 'ellipse', x: 0.5, y: 0.9, rx: 0.3, ry: 0.09, fill: '#0c0812', stroke: '$1', w: 0.03 },
      { t: 'poly', pts: [0.5, 0.2, 0.78, 0.56, 0.72, 0.92, 0.58, 0.82, 0.5, 0.94, 0.42, 0.82, 0.28, 0.92, 0.22, 0.56], fill: '$0', stroke: '$1', w: 0.055 },
      { t: 'poly', pts: [0.5, 0.06, 0.68, 0.22, 0.64, 0.42, 0.36, 0.42, 0.32, 0.22], fill: '#0c0812', stroke: '$1', w: 0.05 },
      { t: 'poly', pts: [0.5, 0.02, 0.4, 0.14, 0.5, 0.1, 0.6, 0.14], fill: '$3', stroke: '$2', w: 0.03 },
      { t: 'circle', x: 0.44, y: 0.26, r: 0.032, fill: '$4' },
      { t: 'circle', x: 0.57, y: 0.26, r: 0.032, fill: '$4' },
      { t: 'line', pts: [0.82, 0.98, 0.76, 0.14], stroke: '$2', w: 0.05 },
      { t: 'blob', x: 0.77, y: 0.08, r: 0.09, lobes: 6, fill: '$3', stroke: '$2', w: 0.03 },
      { t: 'poly', pts: [0.14, 0.34, 0.06, 0.44, 0.16, 0.46], fill: '$1', stroke: '$2', w: 0.025 },
      { t: 'poly', pts: [0.9, 0.62, 0.98, 0.72, 0.88, 0.74], fill: '$1', stroke: '$2', w: 0.025 },
      { t: 'line', pts: [0.34, 0.6, 0.5, 0.68, 0.66, 0.6], stroke: '$3', w: 0.03 },
    ],
  },

  mon_wraith_of_mordred: {
    palette: ['#170f26', '#a05ad0', '#d8b0ff', '#d02b3a'],
    wobble: 0.7,
    shapes: [
      { t: 'poly', pts: [0.5, 0.14, 0.74, 0.5, 0.68, 0.86, 0.56, 0.76, 0.5, 0.9, 0.44, 0.76, 0.32, 0.86, 0.26, 0.5], fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'poly', pts: [0.5, 0.06, 0.66, 0.2, 0.62, 0.4, 0.38, 0.4, 0.34, 0.2], fill: '#0c0812', stroke: '$2', w: 0.04 },
      { t: 'circle', x: 0.44, y: 0.24, r: 0.026, fill: '$3' },
      { t: 'circle', x: 0.57, y: 0.24, r: 0.026, fill: '$3' },
      { t: 'line', pts: [0.72, 0.46, 0.88, 0.36], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.88, 0.36, 0.94, 0.44], stroke: '$2', w: 0.025 },
      { t: 'line', pts: [0.3, 0.52, 0.14, 0.44], stroke: '$1', w: 0.035 },
    ],
  },
}
