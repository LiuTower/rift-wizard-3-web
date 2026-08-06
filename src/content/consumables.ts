import type { ConsumableDef } from '../core/items'
import type { Game } from '../core/game'
import type { Unit } from '../core/unit'
import type { Point } from '../core/types'
import type { Shape, SpriteDef } from '../render/sprite'
import { COMPONENTS, COMPONENT_IDS } from '../core/types'
import { ballPoints } from '../core/geom'
import { applyBuff, cleanse, dealDamage, healUnit, removeBuff, teleportUnit } from '../core/combat'
import { makeBuff } from '../core/buffs'

// Tuning lives next to the definitions so the desc strings cannot drift.
const HEAL_SMALL = 40
const HEAL_LARGE = 100
const SHIELD_COUNT = 2
const SHIELD_TURNS = 20
const HASTE_TURNS = 4
const BOMB_RANGE = 6
const BOMB_RADIUS = 2
const FIRE_BOMB_DAMAGE = 30
const FROST_BOMB_DAMAGE = 20
const FROST_BOMB_FREEZE = 2
const THUNDER_DAMAGE = 40
const THUNDER_RANGE = 10
const TELEPORT_RANGE = 12
const PURITY_HEAL = 15
const POUCH_COMPONENTS = 3
const VIGOR_HP = 10

/** Tiles a thrown bomb reaches, and the hostiles standing in them. */
function blast(g: Game, x: number, y: number, radius: number): { tiles: Point[]; victims: Unit[] } {
  const tiles = ballPoints(x, y, radius).filter(p => g.level.hasLOS(x, y, p.x, p.y))
  const victims: Unit[] = []
  for (const p of tiles) {
    const u = g.level.unitAt(p.x, p.y)
    if (u && u.alive && u.team !== 'player') victims.push(u)
  }
  return { tiles, victims }
}

const manaPotion: ConsumableDef = {
  id: 'mana_potion',
  name: '法力药剂',
  sprite: 'item_mana_potion',
  color: '#5ac8ff',
  desc: '补满法术书中每个法术的全部充能。',
  weight: 4,
  use(g) {
    let restored = 0
    for (const s of g.player.spells) {
      const missing = s.maxCharges - s.charges
      if (missing > 0) restored += missing
      s.charges = s.maxCharges
    }
    if (restored <= 0) return false
    g.fx.ring(g.player.x, g.player.y, 3, '#5ac8ff')
    g.fx.float(g.player.x, g.player.y, `+${restored}`, '#5ac8ff')
    g.log(`法力回涌，恢复 ${restored} 点充能。`, '#5ac8ff')
    g.report.notes.push(`充能 +${restored}`)
    return true
  },
}

const healingPotion: ConsumableDef = {
  id: 'healing_potion',
  name: '治疗药剂',
  sprite: 'item_healing_potion',
  color: '#ff5a7a',
  desc: `恢复 ${HEAL_SMALL} 点生命。`,
  weight: 4,
  use(g) {
    const healed = healUnit(g, g.player, HEAL_SMALL)
    if (healed <= 0) return false
    g.log(`恢复 ${healed} 点生命。`, '#66ff88')
    g.report.notes.push(`生命 +${healed}`)
    return true
  },
}

const greaterHealingPotion: ConsumableDef = {
  id: 'greater_healing_potion',
  name: '强效治疗药剂',
  sprite: 'item_greater_healing_potion',
  color: '#ff2a5a',
  desc: `恢复 ${HEAL_LARGE} 点生命。`,
  weight: 1.5,
  use(g) {
    const healed = healUnit(g, g.player, HEAL_LARGE)
    if (healed <= 0) return false
    g.log(`旧伤闭合，恢复 ${healed} 点生命。`, '#66ff88')
    g.report.notes.push(`生命 +${healed}`)
    return true
  },
}

const shieldPotion: ConsumableDef = {
  id: 'shield_potion',
  name: '护盾药剂',
  sprite: 'item_shield_potion',
  color: '#c8d8ff',
  desc: `获得 ${SHIELD_COUNT} 层护盾。每层护盾抵挡一次受击。`,
  weight: 2,
  use(g) {
    const b = makeBuff('shielded', SHIELD_TURNS, SHIELD_COUNT)
    if (!b) return false
    // Re-applying a live buff only refreshes its duration, so drop the old copy
    // first — otherwise onApply never runs and the shields are never granted.
    if (g.player.hasBuff('shielded')) removeBuff(g, g.player, 'shielded')
    applyBuff(g, g.player, b)
    g.fx.ring(g.player.x, g.player.y, 2, '#c8d8ff')
    g.log(`一层琉璃似的护罩覆上全身。护盾：${g.player.shields}。`, '#c8d8ff')
    return true
  },
}

const hastePotion: ConsumableDef = {
  id: 'haste_potion',
  name: '急速药剂',
  sprite: 'item_haste_potion',
  color: '#ffe019',
  desc: `获得急速，持续 ${HASTE_TURNS} 回合。`,
  weight: 1.5,
  use(g) {
    const existing = g.player.buffOf('hasted')
    if (existing && existing.duration >= HASTE_TURNS) return false
    const b = makeBuff('hasted', HASTE_TURNS)
    if (!b) return false
    applyBuff(g, g.player, b)
    g.fx.ring(g.player.x, g.player.y, 2, '#ffe019')
    g.log('周遭的世界慢成了爬行。', '#ffe019')
    return true
  },
}

const fireBomb: ConsumableDef = {
  id: 'fire_bomb',
  name: '火焰炸弹',
  sprite: 'item_fire_bomb',
  color: '#ff5219',
  desc: `投掷炸弹：对 ${BOMB_RADIUS} 格内的敌人造成 ${FIRE_BOMB_DAMAGE} 点火焰伤害。`,
  target: 'tile',
  range: BOMB_RANGE,
  radius: BOMB_RADIUS,
  weight: 2,
  use(g, x, y) {
    const { tiles, victims } = blast(g, x, y, BOMB_RADIUS)
    if (victims.length === 0) {
      g.log('爆炸范围内空无一物。', '#8890a0')
      return false
    }
    g.fx.bolt(g.player.x, g.player.y, x, y, '#ff5219')
    g.fx.beat()
    g.fx.area(tiles, '#ff5219')
    g.fx.burst(x, y, BOMB_RADIUS, '#ffb03a')
    for (const u of victims) dealDamage(g, u, FIRE_BOMB_DAMAGE, 'fire', g.player)
    return true
  },
}

const frostBomb: ConsumableDef = {
  id: 'frost_bomb',
  name: '寒霜炸弹',
  sprite: 'item_frost_bomb',
  color: '#7fd8ff',
  desc: `投掷炸弹：对 ${BOMB_RADIUS} 格内的敌人造成 ${FROST_BOMB_DAMAGE} 点冰霜伤害，并使其冰冻 ${FROST_BOMB_FREEZE} 回合。`,
  target: 'tile',
  range: BOMB_RANGE,
  radius: BOMB_RADIUS,
  weight: 2,
  use(g, x, y) {
    const { tiles, victims } = blast(g, x, y, BOMB_RADIUS)
    if (victims.length === 0) {
      g.log('爆炸范围内空无一物。', '#8890a0')
      return false
    }
    g.fx.bolt(g.player.x, g.player.y, x, y, '#7fd8ff')
    g.fx.beat()
    g.fx.area(tiles, '#7fd8ff')
    g.fx.burst(x, y, BOMB_RADIUS, '#e0f6ff')
    for (const u of victims) {
      dealDamage(g, u, FROST_BOMB_DAMAGE, 'ice', g.player)
      if (!u.alive) continue
      const b = makeBuff('frozen', FROST_BOMB_FREEZE)
      if (b) applyBuff(g, u, b)
    }
    return true
  },
}

const scrollOfThunder: ConsumableDef = {
  id: 'scroll_of_thunder',
  name: '雷鸣卷轴',
  sprite: 'item_scroll_of_thunder',
  color: '#ffe019',
  desc: `对 ${THUNDER_RANGE} 格内的一个敌人造成 ${THUNDER_DAMAGE} 点闪电伤害，无视墙壁。`,
  target: 'enemy',
  range: THUNDER_RANGE,
  requiresLOS: false,
  weight: 1.5,
  use(g, x, y) {
    const u = g.level.unitAt(x, y)
    if (!u || !u.alive || u.team === 'player') return false
    g.fx.bolt(g.player.x, g.player.y, x, y, '#fff6b0')
    g.fx.strike(x, y, '#ffe019')
    dealDamage(g, u, THUNDER_DAMAGE, 'lightning', g.player)
    g.log('卷轴展开，化作一道惊雷。', '#ffe019')
    return true
  },
}

const scrollOfTeleport: ConsumableDef = {
  id: 'scroll_of_teleport',
  name: '传送卷轴',
  sprite: 'item_scroll_of_teleport',
  color: '#8affea',
  desc: `传送到 ${TELEPORT_RANGE} 格内视线可及的任意位置。`,
  target: 'tile',
  range: TELEPORT_RANGE,
  weight: 2,
  use(g, x, y) {
    if (x === g.player.x && y === g.player.y) return false
    if (!g.level.passable(x, y, g.player.flying)) return false
    const occupant = g.level.unitAt(x, y)
    if (occupant && occupant !== g.player) return false
    if (!teleportUnit(g, g.player, x, y)) return false
    g.log('空间折起，把你丢到别处。', '#8affea')
    return true
  },
}

const scrollOfPurity: ConsumableDef = {
  id: 'scroll_of_purity',
  name: '纯净卷轴',
  sprite: 'item_scroll_of_purity',
  color: '#fff5b0',
  desc: `清除自身所有负面状态，并恢复 ${PURITY_HEAL} 点生命。`,
  weight: 1.5,
  use(g) {
    const cleared = cleanse(g, g.player)
    const healed = healUnit(g, g.player, PURITY_HEAL)
    if (cleared <= 0 && healed <= 0) return false
    g.fx.ring(g.player.x, g.player.y, 2, '#fff5b0')
    if (cleared > 0) {
      g.log(`净光烧尽 ${cleared} 个负面状态。`, '#fff5b0')
      g.report.notes.push(`净化 ${cleared} 项`)
    } else {
      g.log('净光将你重新缝合。', '#fff5b0')
    }
    return true
  },
}

const componentPouch: ConsumableDef = {
  id: 'component_pouch',
  name: '材料袋',
  sprite: 'item_component_pouch',
  color: '#c8a878',
  desc: `随机产出 ${POUCH_COMPONENTS} 份锻造材料。`,
  weight: 1.5,
  use(g) {
    const names: string[] = []
    for (let i = 0; i < POUCH_COMPONENTS; i++) {
      const id = g.rng.pick(COMPONENT_IDS)
      g.giveComponent(id, 1)
      names.push(COMPONENTS[id].name)
    }
    g.fx.float(g.player.x, g.player.y, `+${POUCH_COMPONENTS}`, '#c8a878')
    g.log(`袋子里倒出了 ${names.join('、')}。`, '#c8a878')
    return true
  },
}

const elixirOfVigor: ConsumableDef = {
  id: 'elixir_of_vigor',
  name: '活力药剂',
  sprite: 'item_elixir_of_vigor',
  color: '#9affc0',
  desc: `永久提升 ${VIGOR_HP} 点最大生命。`,
  weight: 0.8,
  use(g) {
    g.player.maxHP += VIGOR_HP
    g.player.hp += VIGOR_HP
    g.fx.ring(g.player.x, g.player.y, 2, '#9affc0')
    g.fx.float(g.player.x, g.player.y, `生命上限 +${VIGOR_HP}`, '#9affc0')
    g.log(`体格变得厚实。最大生命提升至 ${g.player.effectiveMaxHP}。`, '#9affc0')
    return true
  },
}

export const consumables: ConsumableDef[] = [
  manaPotion,
  healingPotion,
  greaterHealingPotion,
  shieldPotion,
  hastePotion,
  fireBomb,
  frostBomb,
  scrollOfThunder,
  scrollOfTeleport,
  scrollOfPurity,
  componentPouch,
  elixirOfVigor,
]

// --------------------------------------------------------------------- sprites
// Note: the DSL resolves a shape's line width from `w` first, and on a `rect`
// `w` is its width — so every stroked box below is a `poly`.

const GLASS = '#1c2230'
const GLASS_INK = '#c8d8ff'
const CORK = '#6a4e34'
const CORK_INK = '#d8b088'
const PAPER = '#2e2a1e'
const PAPER_INK = '#e8dcb0'

/** Shared potion silhouette: corked round-bottomed flask, six shapes. */
function flask(liquid: string, glow: string): Shape[] {
  return [
    { t: 'poly', pts: [0.41, 0.08, 0.59, 0.08, 0.59, 0.18, 0.41, 0.18], fill: CORK, stroke: CORK_INK, w: 0.03 },
    { t: 'poly', pts: [0.44, 0.18, 0.56, 0.18, 0.56, 0.3, 0.44, 0.3], fill: GLASS, stroke: GLASS_INK, w: 0.035 },
    { t: 'poly', pts: [0.44, 0.3, 0.56, 0.3, 0.72, 0.56, 0.68, 0.86, 0.32, 0.86, 0.28, 0.56], fill: GLASS, stroke: GLASS_INK, w: 0.045 },
    { t: 'poly', pts: [0.3, 0.62, 0.7, 0.62, 0.67, 0.84, 0.33, 0.84], fill: liquid },
    { t: 'circle', x: 0.42, y: 0.72, r: 0.035, fill: glow },
    { t: 'line', pts: [0.37, 0.42, 0.34, 0.56], stroke: GLASS_INK, w: 0.028 },
  ]
}

/** Shared scroll silhouette: rolled sheet with a top and bottom spool. */
function scrollBase(): Shape[] {
  return [
    { t: 'poly', pts: [0.3, 0.16, 0.7, 0.16, 0.7, 0.84, 0.3, 0.84], fill: PAPER, stroke: PAPER_INK, w: 0.04 },
    { t: 'line', pts: [0.37, 0.2, 0.37, 0.8], stroke: '#6a6248', w: 0.025 },
    { t: 'ellipse', x: 0.5, y: 0.16, rx: 0.24, ry: 0.075, fill: PAPER, stroke: PAPER_INK, w: 0.035 },
    { t: 'ellipse', x: 0.5, y: 0.84, rx: 0.24, ry: 0.075, fill: PAPER, stroke: PAPER_INK, w: 0.035 },
  ]
}

export const sprites: Record<string, SpriteDef> = {
  // ------------------------------------------------------------------- clouds
  // Hazard fields: open strokes only, so the tile underneath still reads.
  cloud_fire: {
    palette: ['#ff5219', '#ffb03a', '#ff8f5a'],
    wobble: 0.9,
    shapes: [
      { t: 'blob', x: 0.38, y: 0.6, r: 0.2, lobes: 6, stroke: '$0', w: 0.045 },
      { t: 'blob', x: 0.64, y: 0.54, r: 0.16, lobes: 5, stroke: '$2', w: 0.04 },
      { t: 'arc', x: 0.5, y: 0.62, r: 0.3, a0: 3.3, a1: 6.1, stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.3, 0.46, 0.36, 0.22, 0.44, 0.42], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.58, 0.38, 0.68, 0.16, 0.76, 0.36], stroke: '$0', w: 0.035 },
      { t: 'circle', x: 0.5, y: 0.56, r: 0.05, fill: '$1' },
    ],
  },
  cloud_poison: {
    palette: ['#5ad04a', '#a8ff8a', '#2a6a20'],
    wobble: 0.9,
    shapes: [
      { t: 'blob', x: 0.4, y: 0.62, r: 0.2, lobes: 7, stroke: '$0', w: 0.045 },
      { t: 'blob', x: 0.66, y: 0.5, r: 0.15, lobes: 6, stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.3, y: 0.4, r: 0.06, stroke: '$1', w: 0.03 },
      { t: 'circle', x: 0.58, y: 0.26, r: 0.045, stroke: '$0', w: 0.03 },
      { t: 'circle', x: 0.76, y: 0.68, r: 0.05, stroke: '$1', w: 0.03 },
      { t: 'arc', x: 0.5, y: 0.6, r: 0.32, a0: 3.4, a1: 6.0, stroke: '$2', w: 0.035 },
      { t: 'circle', x: 0.46, y: 0.6, r: 0.04, fill: '$1' },
    ],
  },
  cloud_ice: {
    palette: ['#7fd8ff', '#e0f6ff', '#3a7a9a'],
    wobble: 0.7,
    shapes: [
      { t: 'blob', x: 0.48, y: 0.58, r: 0.24, lobes: 6, stroke: '$0', w: 0.04 },
      { t: 'line', pts: [0.3, 0.34, 0.42, 0.46], stroke: '$1', w: 0.03 },
      { t: 'line', pts: [0.42, 0.34, 0.3, 0.46], stroke: '$1', w: 0.03 },
      { t: 'line', pts: [0.62, 0.62, 0.76, 0.76], stroke: '$1', w: 0.03 },
      { t: 'line', pts: [0.76, 0.62, 0.62, 0.76], stroke: '$1', w: 0.03 },
      { t: 'arc', x: 0.5, y: 0.6, r: 0.34, a0: 3.5, a1: 5.9, stroke: '$2', w: 0.032 },
      { t: 'circle', x: 0.52, y: 0.56, r: 0.045, fill: '$1' },
    ],
  },
  cloud_storm: {
    palette: ['#ffe019', '#fff6b0', '#8a7a10'],
    wobble: 0.8,
    shapes: [
      { t: 'blob', x: 0.5, y: 0.46, r: 0.24, lobes: 6, stroke: '$2', w: 0.045 },
      { t: 'line', pts: [0.46, 0.3, 0.56, 0.5, 0.44, 0.56, 0.58, 0.84], stroke: '$0', w: 0.045 },
      { t: 'line', pts: [0.26, 0.5, 0.32, 0.66, 0.24, 0.72], stroke: '$1', w: 0.03 },
      { t: 'line', pts: [0.72, 0.44, 0.78, 0.6, 0.7, 0.68], stroke: '$1', w: 0.03 },
      { t: 'arc', x: 0.5, y: 0.42, r: 0.32, a0: 3.3, a1: 6.1, stroke: '$0', w: 0.03 },
      { t: 'circle', x: 0.5, y: 0.42, r: 0.04, fill: '$1' },
    ],
  },
  cloud_void: {
    palette: ['#ff5cc8', '#ffd0f0', '#6a1a5a'],
    wobble: 0.6,
    shapes: [
      { t: 'circle', x: 0.5, y: 0.54, r: 0.3, stroke: '$2', w: 0.04 },
      { t: 'arc', x: 0.5, y: 0.54, r: 0.22, a0: 0.2, a1: 4.4, stroke: '$0', w: 0.04 },
      { t: 'arc', x: 0.5, y: 0.54, r: 0.13, a0: 2.4, a1: 6.4, stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.5, y: 0.54, r: 0.05, fill: '$1' },
      { t: 'circle', x: 0.24, y: 0.3, r: 0.035, fill: '$0' },
      { t: 'circle', x: 0.78, y: 0.74, r: 0.03, fill: '$0' },
    ],
  },
  cloud_dark: {
    palette: ['#a05ad0', '#d8b0ff', '#3a1a4a'],
    wobble: 0.9,
    shapes: [
      { t: 'blob', x: 0.44, y: 0.6, r: 0.24, lobes: 7, stroke: '$0', w: 0.045 },
      { t: 'blob', x: 0.68, y: 0.42, r: 0.15, lobes: 6, stroke: '$2', w: 0.04 },
      { t: 'arc', x: 0.5, y: 0.58, r: 0.34, a0: 3.4, a1: 6.0, stroke: '$0', w: 0.03 },
      { t: 'circle', x: 0.4, y: 0.56, r: 0.035, fill: '$1' },
      { t: 'circle', x: 0.55, y: 0.6, r: 0.035, fill: '$1' },
      { t: 'line', pts: [0.24, 0.72, 0.32, 0.86], stroke: '$2', w: 0.03 },
      { t: 'line', pts: [0.72, 0.66, 0.8, 0.82], stroke: '$2', w: 0.03 },
    ],
  },
  cloud_holy: {
    palette: ['#fff5b0', '#ffffff', '#c8a83a'],
    wobble: 0.5,
    shapes: [
      { t: 'circle', x: 0.5, y: 0.52, r: 0.18, stroke: '$0', w: 0.045 },
      { t: 'arc', x: 0.5, y: 0.52, r: 0.3, a0: -0.6, a1: 3.6, stroke: '$2', w: 0.03 },
      { t: 'line', pts: [0.5, 0.24, 0.5, 0.08], stroke: '$0', w: 0.032 },
      { t: 'line', pts: [0.74, 0.34, 0.86, 0.22], stroke: '$0', w: 0.03 },
      { t: 'line', pts: [0.26, 0.34, 0.14, 0.22], stroke: '$0', w: 0.03 },
      { t: 'line', pts: [0.5, 0.76, 0.5, 0.9], stroke: '$2', w: 0.03 },
      { t: 'circle', x: 0.5, y: 0.52, r: 0.05, fill: '$1' },
    ],
  },
  cloud_ash: {
    palette: ['#6a6a72', '#a8a8b2', '#3a3a42'],
    wobble: 1,
    shapes: [
      { t: 'blob', x: 0.36, y: 0.56, r: 0.2, lobes: 7, stroke: '$0', w: 0.045 },
      { t: 'blob', x: 0.64, y: 0.62, r: 0.18, lobes: 6, stroke: '$1', w: 0.04 },
      { t: 'blob', x: 0.52, y: 0.32, r: 0.13, lobes: 5, stroke: '$2', w: 0.035 },
      { t: 'arc', x: 0.5, y: 0.6, r: 0.34, a0: 3.5, a1: 5.9, stroke: '$0', w: 0.03 },
      { t: 'circle', x: 0.28, y: 0.8, r: 0.03, fill: '$1' },
      { t: 'circle', x: 0.74, y: 0.28, r: 0.025, fill: '$1' },
    ],
  },

  // --------------------------------------------------------------- components
  comp_umbral: {
    palette: ['#2a1a38', '#a05ad0', '#d8b0ff'],
    wobble: 0.45,
    shapes: [
      { t: 'poly', pts: [0.4, 0.12, 0.6, 0.12, 0.6, 0.23, 0.4, 0.23], fill: '#3a2a20', stroke: '$2', w: 0.035 },
      { t: 'poly', pts: [0.36, 0.23, 0.64, 0.23, 0.66, 0.82, 0.34, 0.82], fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'poly', pts: [0.37, 0.62, 0.63, 0.62, 0.645, 0.8, 0.355, 0.8], fill: '$1' },
      { t: 'circle', x: 0.45, y: 0.4, r: 0.032, fill: '$2' },
      { t: 'circle', x: 0.57, y: 0.5, r: 0.026, fill: '$2' },
      { t: 'line', pts: [0.41, 0.32, 0.41, 0.52], stroke: '$2', w: 0.025 },
    ],
  },
  comp_thorn: {
    palette: ['#1a3a18', '#5ad04a', '#a8ff8a'],
    wobble: 0.55,
    shapes: [
      { t: 'ellipse', x: 0.5, y: 0.64, rx: 0.2, ry: 0.24, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'line', pts: [0.5, 0.42, 0.5, 0.16], stroke: '$1', w: 0.04 },
      { t: 'poly', pts: [0.5, 0.24, 0.28, 0.14, 0.44, 0.3], fill: '$0', stroke: '$1', w: 0.03 },
      { t: 'poly', pts: [0.5, 0.2, 0.72, 0.1, 0.56, 0.26], fill: '$0', stroke: '$2', w: 0.03 },
      { t: 'line', pts: [0.4, 0.6, 0.6, 0.72], stroke: '$2', w: 0.03 },
      { t: 'circle', x: 0.44, y: 0.57, r: 0.03, fill: '$2' },
    ],
  },
  comp_cinder: {
    palette: ['#3a1206', '#ff5219', '#ffb03a'],
    wobble: 0.6,
    shapes: [
      { t: 'poly', pts: [0.32, 0.5, 0.44, 0.3, 0.66, 0.34, 0.74, 0.58, 0.6, 0.78, 0.36, 0.72], fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'line', pts: [0.42, 0.44, 0.56, 0.5, 0.46, 0.62], stroke: '$2', w: 0.035 },
      { t: 'circle', x: 0.62, y: 0.52, r: 0.04, fill: '$2' },
      { t: 'line', pts: [0.5, 0.26, 0.54, 0.12], stroke: '$2', w: 0.03 },
      { t: 'circle', x: 0.3, y: 0.22, r: 0.025, fill: '$1' },
      { t: 'circle', x: 0.76, y: 0.3, r: 0.02, fill: '$1' },
    ],
  },
  comp_halo: {
    palette: ['#3a3418', '#fff5b0', '#ffffff'],
    wobble: 0.4,
    shapes: [
      { t: 'circle', x: 0.5, y: 0.52, r: 0.3, fill: '$0' },
      { t: 'arc', x: 0.5, y: 0.52, r: 0.28, a0: -0.4, a1: 3.9, stroke: '$1', w: 0.06 },
      { t: 'arc', x: 0.5, y: 0.52, r: 0.28, a0: 4.6, a1: 5.6, stroke: '$1', w: 0.05 },
      { t: 'arc', x: 0.5, y: 0.52, r: 0.16, a0: 3.5, a1: 5.9, stroke: '$2', w: 0.035 },
      { t: 'line', pts: [0.62, 0.78, 0.76, 0.9], stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.5, y: 0.22, r: 0.04, fill: '$2' },
    ],
  },
  comp_blood: {
    palette: ['#3a0c12', '#d02b3a', '#ff8f9a'],
    wobble: 0.5,
    shapes: [
      { t: 'poly', pts: [0.5, 0.1, 0.7, 0.5, 0.56, 0.88, 0.36, 0.62, 0.34, 0.32], fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'line', pts: [0.5, 0.16, 0.48, 0.8], stroke: '$1', w: 0.03 },
      { t: 'line', pts: [0.42, 0.4, 0.64, 0.52], stroke: '$2', w: 0.028 },
      { t: 'circle', x: 0.44, y: 0.3, r: 0.03, fill: '$2' },
      { t: 'blob', x: 0.68, y: 0.76, r: 0.08, lobes: 4, fill: '$1', stroke: '$2', w: 0.025 },
    ],
  },
  comp_rime: {
    palette: ['#12303a', '#7fd8ff', '#e0f6ff'],
    wobble: 0.35,
    shapes: [
      { t: 'poly', pts: [0.5, 0.1, 0.72, 0.3, 0.72, 0.68, 0.5, 0.9, 0.28, 0.68, 0.28, 0.3], fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'line', pts: [0.5, 0.14, 0.5, 0.86], stroke: '$1', w: 0.03 },
      { t: 'line', pts: [0.3, 0.34, 0.7, 0.64], stroke: '$2', w: 0.026 },
      { t: 'line', pts: [0.7, 0.34, 0.3, 0.64], stroke: '$2', w: 0.026 },
      { t: 'circle', x: 0.5, y: 0.5, r: 0.05, fill: '$2' },
    ],
  },
  comp_spark: {
    palette: ['#3a3208', '#ffe019', '#fff6b0'],
    wobble: 0.5,
    shapes: [
      { t: 'blob', x: 0.5, y: 0.56, r: 0.3, lobes: 5, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'poly', pts: [0.54, 0.34, 0.6, 0.52, 0.51, 0.54, 0.57, 0.76, 0.42, 0.56, 0.51, 0.53, 0.45, 0.38], fill: '$1', stroke: '$2', w: 0.022 },
      { t: 'arc', x: 0.5, y: 0.56, r: 0.36, a0: -0.9, a1: 0.9, stroke: '$1', w: 0.026 },
      { t: 'circle', x: 0.24, y: 0.34, r: 0.03, fill: '$2' },
      { t: 'circle', x: 0.78, y: 0.72, r: 0.026, fill: '$2' },
    ],
  },
  comp_onyx: {
    palette: ['#22252c', '#c8ccd8', '#8a90a0'],
    wobble: 0.3,
    shapes: [
      { t: 'circle', x: 0.5, y: 0.54, r: 0.26, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'poly', pts: [0.44, 0.2, 0.56, 0.2, 0.56, 0.31, 0.44, 0.31], fill: '$0', stroke: '$1', w: 0.03 },
      { t: 'poly', pts: [0.44, 0.77, 0.56, 0.77, 0.56, 0.88, 0.44, 0.88], fill: '$0', stroke: '$1', w: 0.03 },
      { t: 'poly', pts: [0.14, 0.48, 0.25, 0.48, 0.25, 0.6, 0.14, 0.6], fill: '$0', stroke: '$1', w: 0.03 },
      { t: 'poly', pts: [0.75, 0.48, 0.86, 0.48, 0.86, 0.6, 0.75, 0.6], fill: '$0', stroke: '$1', w: 0.03 },
      { t: 'circle', x: 0.5, y: 0.54, r: 0.1, fill: '#0c0e12', stroke: '$1', w: 0.035 },
      { t: 'arc', x: 0.5, y: 0.54, r: 0.18, a0: 2.6, a1: 5.2, stroke: '$2', w: 0.03 },
    ],
  },

  // ------------------------------------------------------------ world fixtures
  shrine: {
    palette: ['#2a2a34', '#ffd84a', '#8890a0'],
    wobble: 0.35,
    shapes: [
      { t: 'poly', pts: [0.5, 0.12, 0.66, 0.24, 0.66, 0.78, 0.34, 0.78, 0.34, 0.24], fill: '$0', stroke: '$2', w: 0.045 },
      { t: 'poly', pts: [0.26, 0.78, 0.74, 0.78, 0.74, 0.88, 0.26, 0.88], fill: '$0', stroke: '$2', w: 0.04 },
      { t: 'line', pts: [0.5, 0.32, 0.5, 0.68], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.4, 0.42, 0.6, 0.42], stroke: '$1', w: 0.03 },
      { t: 'line', pts: [0.42, 0.58, 0.58, 0.58], stroke: '$1', w: 0.03 },
      { t: 'circle', x: 0.5, y: 0.21, r: 0.05, fill: '$1' },
      { t: 'arc', x: 0.5, y: 0.21, r: 0.15, a0: 3.4, a1: 6.0, stroke: '$1', w: 0.025 },
    ],
  },
  portal: {
    palette: ['#c0a0ff', '#ffffff', '#3a1a6a'],
    wobble: 0.6,
    shapes: [
      { t: 'circle', x: 0.5, y: 0.5, r: 0.34, fill: '$2', stroke: '$0', w: 0.05 },
      { t: 'arc', x: 0.5, y: 0.5, r: 0.24, a0: 0.4, a1: 4.6, stroke: '$0', w: 0.045 },
      { t: 'arc', x: 0.5, y: 0.5, r: 0.15, a0: 2.6, a1: 6.6, stroke: '$1', w: 0.04 },
      { t: 'arc', x: 0.5, y: 0.5, r: 0.08, a0: 0.8, a1: 4.2, stroke: '$0', w: 0.035 },
      { t: 'circle', x: 0.5, y: 0.5, r: 0.035, fill: '$1' },
      { t: 'circle', x: 0.27, y: 0.27, r: 0.025, fill: '$1' },
      { t: 'circle', x: 0.74, y: 0.72, r: 0.02, fill: '$1' },
    ],
  },

  // -------------------------------------------------------------- consumables
  item_mana_potion: {
    wobble: 0.45,
    shapes: [
      ...flask('#2a7ad0', '#a8e0ff'),
      { t: 'line', pts: [0.2, 0.26, 0.27, 0.35, 0.16, 0.33], stroke: '#8ae0ff', w: 0.03 },
      { t: 'circle', x: 0.8, y: 0.3, r: 0.035, fill: '#c8f0ff' },
    ],
  },
  item_healing_potion: {
    wobble: 0.45,
    shapes: [
      ...flask('#c02040', '#ff8f9a'),
      { t: 'line', pts: [0.5, 0.66, 0.5, 0.8], stroke: '#ffe8ec', w: 0.035 },
      { t: 'line', pts: [0.43, 0.73, 0.57, 0.73], stroke: '#ffe8ec', w: 0.035 },
    ],
  },
  item_greater_healing_potion: {
    wobble: 0.45,
    shapes: [
      ...flask('#ff2a5a', '#ffc0cc'),
      { t: 'line', pts: [0.29, 0.59, 0.71, 0.59], stroke: '#ffd84a', w: 0.05 },
      { t: 'line', pts: [0.5, 0.67, 0.5, 0.83], stroke: '#ffffff', w: 0.04 },
      { t: 'line', pts: [0.41, 0.75, 0.59, 0.75], stroke: '#ffffff', w: 0.04 },
    ],
  },
  item_shield_potion: {
    wobble: 0.4,
    shapes: [
      ...flask('#5a72c8', '#c8d8ff'),
      { t: 'poly', pts: [0.5, 0.63, 0.61, 0.67, 0.58, 0.79, 0.5, 0.85, 0.42, 0.79, 0.39, 0.67], fill: '#e8f0ff', stroke: '#3a4a7a', w: 0.022 },
      { t: 'line', pts: [0.5, 0.67, 0.5, 0.81], stroke: '#3a4a7a', w: 0.022 },
    ],
  },
  item_haste_potion: {
    wobble: 0.5,
    shapes: [
      ...flask('#d8b010', '#fff6b0'),
      { t: 'line', pts: [0.39, 0.66, 0.51, 0.73, 0.39, 0.8], stroke: '#fff6b0', w: 0.03 },
      { t: 'line', pts: [0.52, 0.66, 0.64, 0.73, 0.52, 0.8], stroke: '#fff6b0', w: 0.03 },
    ],
  },
  item_elixir_of_vigor: {
    wobble: 0.45,
    shapes: [
      ...flask('#2aa868', '#9affc0'),
      { t: 'line', pts: [0.5, 0.83, 0.5, 0.65], stroke: '#d8ffe8', w: 0.032 },
      { t: 'line', pts: [0.43, 0.72, 0.5, 0.64, 0.57, 0.72], stroke: '#d8ffe8', w: 0.03 },
    ],
  },
  item_fire_bomb: {
    palette: ['#2a1206', '#ff5219', '#ffb03a', '#8a6a4a'],
    wobble: 0.5,
    shapes: [
      { t: 'circle', x: 0.5, y: 0.64, r: 0.28, fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'poly', pts: [0.42, 0.28, 0.58, 0.28, 0.58, 0.4, 0.42, 0.4], fill: '$3', stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.52, 0.28, 0.64, 0.18, 0.6, 0.1], stroke: '$3', w: 0.04 },
      { t: 'circle', x: 0.6, y: 0.08, r: 0.06, fill: '$2', stroke: '$1', w: 0.025 },
      { t: 'line', pts: [0.38, 0.56, 0.46, 0.66, 0.4, 0.74], stroke: '$2', w: 0.035 },
      { t: 'circle', x: 0.6, y: 0.68, r: 0.05, fill: '$1' },
    ],
  },
  item_frost_bomb: {
    palette: ['#0e2632', '#7fd8ff', '#e0f6ff', '#5a7a8a'],
    wobble: 0.45,
    shapes: [
      { t: 'circle', x: 0.5, y: 0.62, r: 0.28, fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'poly', pts: [0.42, 0.27, 0.58, 0.27, 0.58, 0.37, 0.42, 0.37], fill: '$3', stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.5, 0.27, 0.62, 0.17, 0.58, 0.09], stroke: '$3', w: 0.035 },
      { t: 'circle', x: 0.58, y: 0.07, r: 0.055, fill: '$2', stroke: '$1', w: 0.025 },
      { t: 'poly', pts: [0.27, 0.52, 0.14, 0.4, 0.34, 0.44], fill: '$0', stroke: '$1', w: 0.03 },
      { t: 'poly', pts: [0.73, 0.72, 0.88, 0.8, 0.7, 0.86], fill: '$0', stroke: '$1', w: 0.03 },
      { t: 'line', pts: [0.42, 0.56, 0.56, 0.7], stroke: '$2', w: 0.03 },
    ],
  },
  item_scroll_of_thunder: {
    wobble: 0.4,
    shapes: [
      ...scrollBase(),
      { t: 'poly', pts: [0.55, 0.28, 0.61, 0.46, 0.51, 0.48, 0.59, 0.72, 0.44, 0.5, 0.54, 0.46, 0.46, 0.32], fill: '#ffe019', stroke: '#fff6b0', w: 0.022 },
      { t: 'circle', x: 0.66, y: 0.34, r: 0.022, fill: '#fff6b0' },
      { t: 'circle', x: 0.42, y: 0.66, r: 0.02, fill: '#fff6b0' },
    ],
  },
  item_scroll_of_teleport: {
    wobble: 0.4,
    shapes: [
      ...scrollBase(),
      { t: 'arc', x: 0.51, y: 0.5, r: 0.14, a0: 0.4, a1: 4.4, stroke: '#8affea', w: 0.04 },
      { t: 'arc', x: 0.51, y: 0.5, r: 0.07, a0: 2.6, a1: 6.0, stroke: '#d8fff6', w: 0.032 },
      { t: 'circle', x: 0.51, y: 0.5, r: 0.03, fill: '#d8fff6' },
    ],
  },
  item_scroll_of_purity: {
    wobble: 0.4,
    shapes: [
      ...scrollBase(),
      { t: 'circle', x: 0.51, y: 0.5, r: 0.1, fill: '#fff5b0', stroke: '#ffffff', w: 0.025 },
      { t: 'line', pts: [0.51, 0.3, 0.51, 0.38], stroke: '#fff5b0', w: 0.03 },
      { t: 'line', pts: [0.51, 0.62, 0.51, 0.7], stroke: '#fff5b0', w: 0.03 },
      { t: 'line', pts: [0.66, 0.5, 0.72, 0.5], stroke: '#fff5b0', w: 0.028 },
    ],
  },
  item_component_pouch: {
    palette: ['#2a2016', '#c8a878', '#ffe0a8'],
    wobble: 0.55,
    shapes: [
      { t: 'blob', x: 0.5, y: 0.62, r: 0.28, lobes: 5, fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'poly', pts: [0.38, 0.23, 0.62, 0.23, 0.62, 0.35, 0.38, 0.35], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.34, 0.29, 0.24, 0.21], stroke: '$2', w: 0.03 },
      { t: 'line', pts: [0.66, 0.29, 0.76, 0.21], stroke: '$2', w: 0.03 },
      { t: 'circle', x: 0.4, y: 0.15, r: 0.05, fill: '#a05ad0' },
      { t: 'circle', x: 0.55, y: 0.09, r: 0.045, fill: '#5ad04a' },
      { t: 'circle', x: 0.69, y: 0.15, r: 0.04, fill: '#ff5219' },
      { t: 'line', pts: [0.4, 0.66, 0.6, 0.74], stroke: '$1', w: 0.028 },
    ],
  },
}
