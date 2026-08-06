import type { UnitDef } from '../../core/unit'
import type { SpriteDef } from '../../render/sprite'

/**
 * Mid-game bestiary: levels 4-6. These are the creatures that teach the player
 * to read telegraphs, break resistances and kill spawners before the pack
 * arrives. Level 6 species are gated behind realm 8+ so early portals stay
 * survivable.
 */

// ---------------------------------------------------------------- level 4

const troll: UnitDef = {
  id: 'troll', name: '巨魔', sprite: 'mon_troll', color: '#8fd06a',
  maxHP: 62, level: 4, weight: 1.2, minRealm: 6,
  tags: ['living', 'nature'],
  resists: { poison: 50, fire: -50 },
  passives: ['regen'],
  attacks: [
    { kind: 'burst', name: '砸地猛击', damage: 11, damageType: 'physical', radius: 1, cooldown: 4 },
    { kind: 'melee', name: '裂肉之爪', damage: 13, damageType: 'physical', buff: 'bleeding', buffDuration: 3, buffPower: 2 },
  ],
  description: '每回合再生 3 点生命，还会砸击周身的地面，烧死它，否则它永远会重新站起来。',
}

const fireElemental: UnitDef = {
  id: 'fire_elemental', name: '火元素', sprite: 'mon_fire_elemental', color: '#ff5219',
  maxHP: 46, level: 4, minRealm: 6,
  tags: ['elemental'],
  resists: { fire: 100, ice: -50 },
  passives: ['flame_aura'],
  attacks: [
    { kind: 'burst', name: '烈焰爆发', damage: 12, damageType: 'fire', radius: 2, cooldown: 4, buff: 'burning', buffDuration: 3 },
    { kind: 'melee', name: '灼烧之触', damage: 11, damageType: 'fire' },
  ],
  description: '免疫火焰，每回合烧灼 2 格内的一切，冰霜能把它裂开。',
}

const iceElemental: UnitDef = {
  id: 'ice_elemental', name: '冰元素', sprite: 'mon_ice_elemental', color: '#7fd8ff',
  maxHP: 52, level: 4, minRealm: 6,
  tags: ['elemental'],
  resists: { ice: 100, fire: -50 },
  attacks: [
    { kind: 'bolt', name: '冰冻箭', range: 5, damage: 12, damageType: 'ice', buff: 'frozen', buffDuration: 1, cooldown: 4 },
    { kind: 'melee', name: '霜爪', damage: 10, damageType: 'ice' },
  ],
  description: '它的箭矢让目标冰冻 1 回合，免疫冰霜，却在火焰面前不堪一击。',
}

const stormElemental: UnitDef = {
  id: 'storm_elemental', name: '风暴元素', sprite: 'mon_storm_elemental', color: '#ffe019',
  maxHP: 48, level: 4, minRealm: 6,
  tags: ['elemental'],
  resists: { lightning: 100, physical: 25 },
  passives: ['storm_aura'],
  attacks: [
    { kind: 'beam', name: '电弧放电', range: 6, damage: 12, damageType: 'lightning', cooldown: 3 },
    { kind: 'melee', name: '静电鞭击', damage: 10, damageType: 'lightning', buff: 'conductance', buffDuration: 3 },
  ],
  description: '射线沿一条直线击穿一切，触碰还会让目标导电，别指望用闪电打死它。',
}

const vampire: UnitDef = {
  id: 'vampire', name: '吸血鬼', sprite: 'mon_vampire', color: '#d0507a',
  maxHP: 58, level: 4, weight: 0.8, minRealm: 6,
  tags: ['undead'],
  resists: { dark: 100, physical: 25, holy: -50 },
  attacks: [
    { kind: 'debuff', name: '吸血', damage: 12, damageType: 'dark', buff: 'bleeding', buffDuration: 4, buffPower: 3 },
    { kind: 'heal_allies', name: '血宴', radius: 3, heal: 12, cooldown: 5, color: '#d0507a' },
  ],
  description: '割开止不住的伤口，再用血宴治好自己和受伤的同类，神圣能打断这套循环。',
}

const mantis: UnitDef = {
  id: 'mantis', name: '裂隙螳螂', sprite: 'mon_mantis', color: '#9ae04a',
  maxHP: 40, level: 4, weight: 1.2, minRealm: 6,
  tags: ['nature'],
  resists: { poison: 50, ice: -25 },
  attacks: [
    { kind: 'pull', name: '钩爪', range: 4, minRange: 2, damage: 5, damageType: 'physical', radius: 3, cooldown: 4 },
    { kind: 'melee', name: '镰臂', damage: 16, damageType: 'physical', buff: 'bleeding', buffDuration: 3, buffPower: 2 },
  ],
  description: '先把目标拽进近身，再用双镰剖开，身板薄如纸，抢在它出手前杀掉。',
}

const undeadGate: UnitDef = {
  id: 'undead_gate', name: '亡灵之门', sprite: 'mon_undead_gate', color: '#d8d0a8',
  maxHP: 55, level: 4, weight: 0.7, minRealm: 6,
  stationary: true,
  tags: ['undead', 'construct'],
  resists: { physical: 50, dark: 100, ice: 75, poison: 100, holy: -50 },
  attacks: [
    { kind: 'summon', name: '吐出亡者', summonId: 'skeleton_warrior', summonCount: 1, cooldown: 7, startCooldown: 2, color: '#a05ad0' },
    { kind: 'bolt', name: '墓语', range: 5, damage: 10, damageType: 'dark' },
  ],
  description: '一座永不移动也永不停手的骨拱，每 7 回合走出一具新骷髅，用神圣拆掉它。',
}

const skeletonWarrior: UnitDef = {
  id: 'skeleton_warrior', name: '骷髅战士', sprite: 'mon_skeleton_warrior', color: '#e0dcc8',
  maxHP: 42, level: 4, weight: 0, minRealm: 6,
  tags: ['undead'],
  resists: { physical: 25, dark: 100, ice: 50, poison: 100, holy: -50 },
  attacks: [
    { kind: 'melee', name: '锈刃', damage: 12, damageType: 'physical' },
  ],
  description: '锈甲配一把耐心的剑，只会从亡灵之门或亡灵法师手里走出来，神圣能砍穿它。',
}

// ---------------------------------------------------------------- level 5

const cyclops: UnitDef = {
  id: 'cyclops', name: '独眼巨人', sprite: 'mon_cyclops', color: '#e0b07a',
  maxHP: 88, level: 5, minRealm: 9,
  tags: ['living'],
  resists: { physical: 25, arcane: -25 },
  attacks: [
    { kind: 'blast', name: '投掷巨石', range: 6, minRange: 2, radius: 1, damage: 16, damageType: 'physical', cooldown: 3, telegraph: true },
    { kind: 'melee', name: '骨棒', damage: 18, damageType: 'physical' },
  ],
  description: '抬手蓄力的巨石看得一清二楚，要么走出溅射范围，要么走出这场战斗。',
}

const wraith: UnitDef = {
  id: 'wraith', name: '怨灵', sprite: 'mon_wraith', color: '#9a8fd0',
  maxHP: 74, level: 5, weight: 0.9, minRealm: 9,
  flying: true,
  tags: ['undead'],
  resists: { physical: 50, dark: 100, ice: 50, poison: 100, holy: -50 },
  attacks: [
    { kind: 'debuff', name: '墓中寒意', range: 5, damage: 6, damageType: 'dark', buff: 'cursed', buffDuration: 5, cooldown: 5 },
    { kind: 'melee', name: '撕魂', damage: 16, damageType: 'dark' },
  ],
  description: '飘过深渊、减免一半物理伤害，靠近前先扣上一道诅咒，只有神圣咬得动它。',
}

const ironGolem: UnitDef = {
  id: 'iron_golem', name: '铁魔像', sprite: 'mon_iron_golem', color: '#b8c4d0',
  maxHP: 106, level: 5, weight: 0.8, minRealm: 9,
  tags: ['construct', 'metallic'],
  resists: { physical: 75, fire: 50, ice: 50, poison: 100, arcane: 25, lightning: -50 },
  attacks: [
    { kind: 'burst', name: '活塞重击', radius: 2, damage: 19, damageType: 'physical', cooldown: 4, telegraph: true },
    { kind: 'melee', name: '铁拳', damage: 16, damageType: 'physical' },
  ],
  description: '笨重、有预警，几乎免疫钢铁与火焰，闪电能撕开它的甲板。',
}

const salamander: UnitDef = {
  id: 'salamander', name: '火蜥蜴', sprite: 'mon_salamander', color: '#ff7a2a',
  maxHP: 78, level: 5, minRealm: 9,
  tags: ['living', 'elemental'],
  resists: { fire: 100, ice: -50 },
  attacks: [
    { kind: 'breath', name: '火焰吐息', range: 4, damage: 16, damageType: 'fire', buff: 'burning', buffDuration: 3, buffPower: 3, cooldown: 3 },
    { kind: 'melee', name: '炽烬撕咬', damage: 14, damageType: 'fire' },
  ],
  description: '喷出一道锥形火焰，把范围内的一切点燃，火焰伤不到它，换冰霜。',
}

const voidChild: UnitDef = {
  id: 'void_child', name: '虚空之子', sprite: 'mon_void_child', color: '#ff5cc8',
  maxHP: 72, level: 5, weight: 0.9, minRealm: 9,
  tags: ['arcane'],
  resists: { arcane: 100, physical: 25, dark: 50, holy: -50 },
  attacks: [
    { kind: 'blast', name: '虚空撕裂', range: 5, radius: 1, damage: 16, damageType: 'arcane', cooldown: 3 },
    { kind: 'teleport', name: '折叠空间', range: 6, minRange: 3, cooldown: 4, color: '#ff5cc8' },
    { kind: 'melee', name: '消解之触', damage: 15, damageType: 'arcane' },
  ],
  description: '披着孩童外形的世界破洞，折叠空间就出现在你身边，奥术碰不到它，用神圣。',
}

// ---------------------------------------------------------------- level 6

const boneWizard: UnitDef = {
  id: 'bone_wizard', name: '白骨巫师', sprite: 'mon_bone_wizard', color: '#c8d8e8',
  maxHP: 118, level: 6, weight: 0.8, minRealm: 10,
  tags: ['undead'],
  resists: { dark: 100, ice: 50, poison: 100, physical: 25, holy: -50 },
  attacks: [
    { kind: 'summon', name: '唤起战士', summonId: 'skeleton_warrior', summonCount: 2, cooldown: 6, startCooldown: 2, color: '#7fd8ff' },
    { kind: 'debuff', name: '脆弱诅咒', range: 5, damage: 6, damageType: 'dark', buff: 'cursed', buffDuration: 5, cooldown: 4 },
    { kind: 'bolt', name: '骨箭', range: 6, damage: 22, damageType: 'dark' },
  ],
  description: '一次唤起两名骷髅战士，再诅咒它们扑向的目标，先杀巫师。',
}

const yeti: UnitDef = {
  id: 'yeti', name: '雪怪', sprite: 'mon_yeti', color: '#dff2ff',
  maxHP: 140, level: 6, weight: 0.9, minRealm: 11,
  tags: ['living'],
  resists: { ice: 100, physical: 25, fire: -50 },
  attacks: [
    { kind: 'blast', name: '雪崩重砸', range: 3, radius: 2, damage: 24, damageType: 'ice', buff: 'frozen', buffDuration: 1, cooldown: 4, telegraph: true },
    { kind: 'melee', name: '霜咬重锤', damage: 24, damageType: 'ice' },
  ],
  description: '抬手之后砸出半径 2 格的冰坑，留在里面的会被冰冻，火焰能毁掉它的一天。',
}

const chaosKnight: UnitDef = {
  id: 'chaos_knight', name: '混乱骑士', sprite: 'mon_chaos_knight', color: '#ff5219',
  maxHP: 132, level: 6, weight: 0.7, minRealm: 12,
  tags: ['chaos', 'living'],
  resists: { fire: 50, lightning: 50, physical: 25, holy: -50 },
  passives: ['enchanted'],
  attacks: [
    { kind: 'bolt', name: '炼狱火矛', range: 5, damage: 20, damageType: 'fire', buff: 'burning', buffDuration: 3, buffPower: 3, cooldown: 3 },
    { kind: 'beam', name: '雷霆冲锋', range: 5, damage: 20, damageType: 'lightning', cooldown: 4 },
    { kind: 'melee', name: '混乱之刃', damage: 22, damageType: 'physical' },
  ],
  description: '强化过的重甲、三种伤害类型、没有软肋，它抗火焰与闪电，但不抗神圣。',
}

export const units: UnitDef[] = [
  troll, fireElemental, iceElemental, stormElemental, vampire, mantis, undeadGate, skeletonWarrior,
  cyclops, wraith, ironGolem, salamander, voidChild,
  boneWizard, yeti, chaosKnight,
]

export const sprites: Record<string, SpriteDef> = {
  mon_troll: {
    palette: ['#2c4a2a', '#8fd06a', '#3e6a38', '#ffe0a0'],
    wobble: 0.6,
    shapes: [
      { t: 'line', pts: [0.4, 0.8, 0.34, 0.96], stroke: '$1', w: 0.06 },
      { t: 'line', pts: [0.6, 0.8, 0.68, 0.96], stroke: '$1', w: 0.06 },
      { t: 'blob', x: 0.5, y: 0.62, r: 0.27, lobes: 6, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'line', pts: [0.28, 0.5, 0.1, 0.68, 0.2, 0.84], stroke: '$1', w: 0.05 },
      { t: 'line', pts: [0.72, 0.5, 0.9, 0.68, 0.8, 0.84], stroke: '$1', w: 0.05 },
      { t: 'circle', x: 0.5, y: 0.24, r: 0.15, fill: '$2', stroke: '$1', w: 0.045 },
      { t: 'poly', pts: [0.42, 0.32, 0.46, 0.4, 0.5, 0.32], fill: '$3', stroke: '$0', w: 0.02 },
      { t: 'circle', x: 0.44, y: 0.22, r: 0.03, fill: '$3' },
      { t: 'circle', x: 0.57, y: 0.22, r: 0.03, fill: '$3' },
    ],
  },

  mon_fire_elemental: {
    palette: ['#5a1608', '#ffb03a', '#ff5219', '#fff0c0'],
    wobble: 0.9,
    shapes: [
      { t: 'blob', x: 0.5, y: 0.62, r: 0.29, lobes: 7, fill: '$0', stroke: '$2', w: 0.05 },
      { t: 'poly', pts: [0.5, 0.06, 0.66, 0.42, 0.5, 0.34, 0.34, 0.42], fill: '$2', stroke: '$1', w: 0.04 },
      { t: 'blob', x: 0.5, y: 0.6, r: 0.16, lobes: 6, fill: '$2', stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.22, 0.72, 0.16, 0.5], stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.78, 0.72, 0.84, 0.5], stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.43, y: 0.56, r: 0.032, fill: '$3' },
      { t: 'circle', x: 0.57, y: 0.56, r: 0.032, fill: '$3' },
    ],
  },

  mon_ice_elemental: {
    palette: ['#173a4a', '#7fd8ff', '#0d2230', '#e8faff'],
    wobble: 0.25,
    shapes: [
      { t: 'poly', pts: [0.5, 0.06, 0.74, 0.5, 0.62, 0.92, 0.38, 0.92, 0.26, 0.5], fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'poly', pts: [0.2, 0.44, 0.32, 0.34, 0.3, 0.72], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.8, 0.44, 0.68, 0.34, 0.7, 0.72], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.5, 0.16, 0.5, 0.84], stroke: '$1', w: 0.03 },
      { t: 'line', pts: [0.36, 0.52, 0.64, 0.52], stroke: '$3', w: 0.025 },
      { t: 'circle', x: 0.43, y: 0.42, r: 0.033, fill: '$3' },
      { t: 'circle', x: 0.57, y: 0.42, r: 0.033, fill: '$3' },
    ],
  },

  mon_storm_elemental: {
    palette: ['#25293a', '#ffe019', '#8fa0d0', '#fffbe0'],
    wobble: 0.8,
    shapes: [
      { t: 'blob', x: 0.5, y: 0.42, r: 0.28, lobes: 6, fill: '$0', stroke: '$2', w: 0.045 },
      { t: 'arc', x: 0.5, y: 0.42, r: 0.36, a0: 2.6, a1: 5.2, stroke: '$2', w: 0.03 },
      { t: 'line', pts: [0.52, 0.6, 0.4, 0.76, 0.54, 0.74, 0.44, 0.96], stroke: '$1', w: 0.05 },
      { t: 'line', pts: [0.7, 0.58, 0.78, 0.78], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.3, 0.58, 0.22, 0.78], stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.42, y: 0.38, r: 0.038, fill: '$1' },
      { t: 'circle', x: 0.58, y: 0.38, r: 0.038, fill: '$1' },
      { t: 'circle', x: 0.5, y: 0.42, r: 0.09, fill: '$3', stroke: '$1', w: 0.02 },
    ],
  },

  mon_vampire: {
    palette: ['#2a1420', '#d0507a', '#4e1c2e', '#ffd8e0'],
    wobble: 0.4,
    shapes: [
      { t: 'poly', pts: [0.5, 0.3, 0.12, 0.56, 0.28, 0.92, 0.5, 0.7], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.5, 0.3, 0.88, 0.56, 0.72, 0.92, 0.5, 0.7], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.42, 0.34, 0.58, 0.34, 0.6, 0.92, 0.4, 0.92], fill: '$2', stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.34, 0.36, 0.5, 0.29, 0.66, 0.36], stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.5, y: 0.2, r: 0.11, fill: '#e8d8d0', stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.46, y: 0.19, r: 0.024, fill: '$1' },
      { t: 'circle', x: 0.55, y: 0.19, r: 0.024, fill: '$1' },
      { t: 'poly', pts: [0.46, 0.26, 0.5, 0.34, 0.54, 0.26], fill: '$3' },
    ],
  },

  mon_mantis: {
    palette: ['#1e3a18', '#9ae04a', '#0f2010', '#ffe019'],
    wobble: 0.45,
    shapes: [
      { t: 'ellipse', x: 0.48, y: 0.66, rx: 0.15, ry: 0.26, rot: 0.12, fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.5, 0.14, 0.64, 0.34, 0.36, 0.34], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.36, 0.44, 0.16, 0.34, 0.24, 0.14], stroke: '$1', w: 0.055 },
      { t: 'line', pts: [0.64, 0.44, 0.84, 0.34, 0.76, 0.14], stroke: '$1', w: 0.055 },
      { t: 'line', pts: [0.42, 0.14, 0.34, 0.02], stroke: '$1', w: 0.025 },
      { t: 'line', pts: [0.58, 0.14, 0.66, 0.02], stroke: '$1', w: 0.025 },
      { t: 'line', pts: [0.36, 0.78, 0.2, 0.94], stroke: '$1', w: 0.03 },
      { t: 'circle', x: 0.44, y: 0.26, r: 0.035, fill: '$3' },
      { t: 'circle', x: 0.57, y: 0.26, r: 0.035, fill: '$3' },
    ],
  },

  mon_undead_gate: {
    palette: ['#3a3428', '#d8d0a8', '#0c0a08', '#a05ad0'],
    wobble: 0.35,
    shapes: [
      { t: 'poly', pts: [0.12, 0.34, 0.28, 0.34, 0.28, 0.94, 0.12, 0.94], fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'poly', pts: [0.72, 0.34, 0.88, 0.34, 0.88, 0.94, 0.72, 0.94], fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'arc', x: 0.5, y: 0.36, r: 0.28, a0: 3.14, a1: 6.28, stroke: '$1', w: 0.06 },
      { t: 'ellipse', x: 0.5, y: 0.62, rx: 0.2, ry: 0.3, fill: '#1a0a24', stroke: '$3', w: 0.04 },
      { t: 'blob', x: 0.5, y: 0.66, r: 0.11, lobes: 5, fill: '$3', stroke: '$1', w: 0.02 },
      { t: 'circle', x: 0.5, y: 0.16, r: 0.1, fill: '$0', stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.46, y: 0.15, r: 0.024, fill: '$3' },
      { t: 'circle', x: 0.55, y: 0.15, r: 0.024, fill: '$3' },
    ],
  },

  mon_skeleton_warrior: {
    palette: ['#2a2a26', '#e0dcc8', '#12120f', '#8a6a4a'],
    wobble: 0.5,
    shapes: [
      { t: 'poly', pts: [0.44, 0.36, 0.6, 0.44, 0.56, 0.7, 0.34, 0.7, 0.3, 0.44], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.33, 0.5, 0.57, 0.5], stroke: '$1', w: 0.025 },
      { t: 'line', pts: [0.38, 0.7, 0.34, 0.94], stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.52, 0.7, 0.56, 0.94], stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.86, 0.14, 0.66, 0.62], stroke: '$1', w: 0.045 },
      { t: 'ellipse', x: 0.2, y: 0.58, rx: 0.12, ry: 0.17, fill: '$3', stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.45, y: 0.24, r: 0.12, fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.41, y: 0.23, r: 0.028, fill: '#7fd8ff' },
      { t: 'circle', x: 0.51, y: 0.23, r: 0.028, fill: '#7fd8ff' },
    ],
  },

  mon_cyclops: {
    palette: ['#4a3a2c', '#e0b07a', '#1e1712', '#fff5d0'],
    wobble: 0.5,
    shapes: [
      { t: 'line', pts: [0.4, 0.78, 0.34, 0.96], stroke: '$1', w: 0.065 },
      { t: 'line', pts: [0.6, 0.78, 0.66, 0.96], stroke: '$1', w: 0.065 },
      { t: 'blob', x: 0.5, y: 0.64, r: 0.28, lobes: 6, fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'circle', x: 0.5, y: 0.3, r: 0.16, fill: '#6b543f', stroke: '$1', w: 0.045 },
      { t: 'circle', x: 0.5, y: 0.29, r: 0.065, fill: '$3', stroke: '$2', w: 0.025 },
      { t: 'circle', x: 0.5, y: 0.29, r: 0.024, fill: '$2' },
      { t: 'line', pts: [0.76, 0.56, 0.86, 0.34], stroke: '$1', w: 0.055 },
      { t: 'circle', x: 0.86, y: 0.22, r: 0.13, fill: '#4d4842', stroke: '#a8a29a', w: 0.04 },
    ],
  },

  mon_wraith: {
    palette: ['#1c1a2a', '#9a8fd0', '#0a0812', '#c8ffff'],
    wobble: 0.9,
    shapes: [
      { t: 'poly', pts: [0.5, 0.08, 0.78, 0.5, 0.72, 0.9, 0.58, 0.74, 0.5, 0.94, 0.42, 0.74, 0.28, 0.9, 0.22, 0.5], fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'arc', x: 0.5, y: 0.3, r: 0.19, a0: 3.34, a1: 6.08, stroke: '$1', w: 0.045 },
      { t: 'ellipse', x: 0.5, y: 0.3, rx: 0.13, ry: 0.15, fill: '$2' },
      { t: 'circle', x: 0.44, y: 0.29, r: 0.033, fill: '$3' },
      { t: 'circle', x: 0.57, y: 0.29, r: 0.033, fill: '$3' },
      { t: 'line', pts: [0.74, 0.44, 0.88, 0.6, 0.8, 0.68], stroke: '$1', w: 0.035 },
    ],
  },

  mon_iron_golem: {
    palette: ['#2e3238', '#b8c4d0', '#181b20', '#ffb03a'],
    wobble: 0.15,
    shapes: [
      { t: 'poly', pts: [0.3, 0.34, 0.7, 0.34, 0.66, 0.72, 0.34, 0.72], fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'poly', pts: [0.36, 0.12, 0.64, 0.12, 0.64, 0.31, 0.36, 0.31], fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'poly', pts: [0.12, 0.36, 0.28, 0.36, 0.28, 0.7, 0.12, 0.7], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.72, 0.36, 0.88, 0.36, 0.88, 0.7, 0.72, 0.7], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.4, 0.72, 0.38, 0.94], stroke: '$1', w: 0.075 },
      { t: 'line', pts: [0.6, 0.72, 0.62, 0.94], stroke: '$1', w: 0.075 },
      { t: 'circle', x: 0.5, y: 0.52, r: 0.06, fill: '$2', stroke: '$3', w: 0.03 },
      { t: 'circle', x: 0.44, y: 0.21, r: 0.03, fill: '$3' },
      { t: 'circle', x: 0.57, y: 0.21, r: 0.03, fill: '$3' },
    ],
  },

  mon_salamander: {
    palette: ['#3a1608', '#ff7a2a', '#160804', '#ffe6a0'],
    wobble: 0.55,
    shapes: [
      { t: 'ellipse', x: 0.44, y: 0.64, rx: 0.28, ry: 0.16, rot: -0.1, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'line', pts: [0.18, 0.68, 0.08, 0.52, 0.14, 0.36], stroke: '$1', w: 0.045 },
      { t: 'poly', pts: [0.3, 0.5, 0.38, 0.34, 0.46, 0.5, 0.54, 0.34, 0.62, 0.5], fill: '$1', stroke: '$3', w: 0.02, open: true },
      { t: 'circle', x: 0.76, y: 0.56, r: 0.13, fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.78, y: 0.52, r: 0.032, fill: '$3' },
      { t: 'blob', x: 0.92, y: 0.62, r: 0.08, lobes: 5, fill: '$1', stroke: '$3', w: 0.02 },
      { t: 'line', pts: [0.34, 0.76, 0.28, 0.92], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.6, 0.76, 0.66, 0.92], stroke: '$1', w: 0.035 },
    ],
  },

  mon_void_child: {
    palette: ['#2a1240', '#ff5cc8', '#100620', '#ffffff'],
    wobble: 0.7,
    shapes: [
      { t: 'blob', x: 0.5, y: 0.6, r: 0.25, lobes: 5, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'circle', x: 0.5, y: 0.28, r: 0.13, fill: '$2', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.45, y: 0.27, r: 0.03, fill: '$3' },
      { t: 'circle', x: 0.56, y: 0.27, r: 0.03, fill: '$3' },
      { t: 'line', pts: [0.16, 0.36, 0.3, 0.48], stroke: '$1', w: 0.03 },
      { t: 'line', pts: [0.84, 0.36, 0.7, 0.48], stroke: '$1', w: 0.03 },
      { t: 'poly', pts: [0.34, 0.8, 0.42, 0.96, 0.5, 0.82, 0.58, 0.96, 0.66, 0.8], fill: '$2', stroke: '$1', w: 0.03 },
    ],
  },

  mon_bone_wizard: {
    palette: ['#241f2c', '#c8d8e8', '#0e0c12', '#7fd8ff'],
    wobble: 0.45,
    shapes: [
      { t: 'poly', pts: [0.5, 0.3, 0.74, 0.94, 0.26, 0.94], fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'line', pts: [0.32, 0.5, 0.24, 0.72], stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.86, 0.1, 0.72, 0.9], stroke: '#6a5a4a', w: 0.045 },
      { t: 'circle', x: 0.87, y: 0.08, r: 0.07, fill: '$2', stroke: '$3', w: 0.03 },
      { t: 'circle', x: 0.5, y: 0.22, r: 0.12, fill: '#d8d4c0', stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.45, y: 0.21, r: 0.028, fill: '$3' },
      { t: 'circle', x: 0.56, y: 0.21, r: 0.028, fill: '$3' },
      { t: 'poly', pts: [0.32, 0.44, 0.5, 0.34, 0.68, 0.44, 0.62, 0.52, 0.38, 0.52], fill: '$2', stroke: '$1', w: 0.03 },
    ],
  },

  mon_yeti: {
    palette: ['#3a4a58', '#dff2ff', '#55697a', '#7fd8ff'],
    wobble: 0.75,
    shapes: [
      { t: 'blob', x: 0.5, y: 0.62, r: 0.31, lobes: 8, fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'line', pts: [0.22, 0.5, 0.1, 0.74, 0.22, 0.86], stroke: '$1', w: 0.06 },
      { t: 'line', pts: [0.78, 0.5, 0.9, 0.74, 0.78, 0.86], stroke: '$1', w: 0.06 },
      { t: 'circle', x: 0.5, y: 0.26, r: 0.16, fill: '$2', stroke: '$1', w: 0.045 },
      { t: 'arc', x: 0.5, y: 0.3, r: 0.09, a0: 0.4, a1: 2.74, stroke: '$1', w: 0.035 },
      { t: 'poly', pts: [0.42, 0.34, 0.44, 0.42, 0.47, 0.34], fill: '$1' },
      { t: 'poly', pts: [0.53, 0.34, 0.56, 0.42, 0.58, 0.34], fill: '$1' },
      { t: 'circle', x: 0.44, y: 0.23, r: 0.032, fill: '$3' },
      { t: 'circle', x: 0.57, y: 0.23, r: 0.032, fill: '$3' },
    ],
  },

  mon_chaos_knight: {
    palette: ['#2a1a22', '#ff5219', '#12080c', '#ffe019'],
    wobble: 0.35,
    shapes: [
      { t: 'poly', pts: [0.5, 0.26, 0.72, 0.46, 0.66, 0.94, 0.34, 0.94, 0.28, 0.46], fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'poly', pts: [0.24, 0.42, 0.36, 0.34, 0.34, 0.5], fill: '$0', stroke: '$3', w: 0.035 },
      { t: 'poly', pts: [0.76, 0.42, 0.64, 0.34, 0.66, 0.5], fill: '$0', stroke: '$3', w: 0.035 },
      { t: 'poly', pts: [0.5, 0.04, 0.64, 0.3, 0.36, 0.3], fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'circle', x: 0.44, y: 0.22, r: 0.028, fill: '$3' },
      { t: 'circle', x: 0.57, y: 0.22, r: 0.028, fill: '$3' },
      { t: 'line', pts: [0.88, 0.12, 0.72, 0.82], stroke: '#c8c8c8', w: 0.05 },
      { t: 'blob', x: 0.84, y: 0.3, r: 0.09, lobes: 5, fill: '$1', stroke: '$3', w: 0.02 },
      { t: 'line', pts: [0.16, 0.62, 0.24, 0.7, 0.14, 0.78], stroke: '$3', w: 0.035 },
    ],
  },
}
