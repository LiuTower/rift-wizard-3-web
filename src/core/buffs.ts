import type { Buff, Unit } from './unit'
import type { Game } from './game'
import type { DamageType } from './types'
import { DAMAGE_COLORS, DAMAGE_NAMES } from './types'
import { dealDamage, healUnit, removeBuff, unitsNear } from './combat'

export type BuffFactory = (duration: number, power?: number) => Buff

/** Damage over time. Ticks at the end of the victim's turn. */
export function dot(id: string, name: string, type: DamageType, dmg: number, duration: number, stacking: 'stack' | 'refresh' = 'refresh'): Buff {
  return {
    id, name, kind: 'debuff', duration, stacks: 1, stacking,
    color: DAMAGE_COLORS[type],
    desc: `每回合受到 ${dmg} 点${DAMAGE_NAMES[type]}伤害。`,
    onTurnEnd(u, g) {
      dealDamage(g, u, dmg * (this.stacks ?? 1), type, undefined)
    },
  }
}

export function resistBuff(
  id: string, name: string, resists: Partial<Record<DamageType, number>>,
  duration: number, color = '#9ad0ff',
): Buff {
  return { id, name, kind: 'buff', duration, resists, color }
}

/** Deals damage to everything hostile within radius each turn. */
export function auraBuff(
  id: string, name: string, type: DamageType, dmg: number, radius: number, duration: number,
): Buff {
  return {
    id, name, kind: 'buff', duration, color: DAMAGE_COLORS[type],
    desc: `每回合对 ${radius} 格内的敌人造成 ${dmg} 点${DAMAGE_NAMES[type]}伤害。`,
    onTurnEnd(u, g) {
      const targets = unitsNear(g, u.x, u.y, radius, t => t.isHostileTo(u))
      for (const t of targets) {
        g.fx.beam(u.x, u.y, t.x, t.y, DAMAGE_COLORS[type], 0.5)
        dealDamage(g, t, dmg, type, u)
      }
    },
  }
}

export const BUFFS: Record<string, BuffFactory> = {
  stunned: d => ({
    id: 'stunned', name: '眩晕', kind: 'debuff', duration: d, stun: true, color: '#ffd84a',
    desc: '无法行动。',
  }),

  frozen: d => ({
    id: 'frozen', name: '冰冻', kind: 'debuff', duration: d, stun: true, color: '#7fd8ff',
    desc: '无法行动。火焰伤害会解冻。',
    resists: { ice: 50, fire: -50 },
    onHurt(u, g, ev) {
      if (ev.type === 'fire') {
        g.log(`${u.name} thaws.`, '#ff8f5a')
        removeBuff(g, u, 'frozen')
      }
    },
  }),

  petrified: d => ({
    id: 'petrified', name: '石化', kind: 'debuff', duration: d, stun: true, color: '#b0a898',
    desc: '无法行动。抵抗物理、火焰、闪电与冰霜。',
    resists: { physical: 50, fire: 50, lightning: 50, ice: 50 },
  }),

  glassified: d => ({
    id: 'glassified', name: '琉璃化', kind: 'debuff', duration: d, stun: true, color: '#c8f0ff',
    desc: '无法行动。受到双倍物理伤害。',
    resists: { physical: -100 },
  }),

  poisoned: (d, p = 1) => dot('poisoned', '中毒', 'poison', p, d, 'stack'),
  burning: (d, p = 2) => dot('burning', '燃烧', 'fire', p, d, 'refresh'),
  bleeding: (d, p = 2) => dot('bleeding', '流血', 'physical', p, d, 'stack'),

  berserk: d => ({
    id: 'berserk', name: '狂暴', kind: 'debuff', duration: d, berserk: true, color: '#ff5a5a',
    desc: '攻击身边的一切，不分敌友。',
  }),

  blind: d => ({
    id: 'blind', name: '失明', kind: 'debuff', duration: d, blind: true, color: '#8890a0',
    desc: '无法使用远程或指向性能力。',
  }),

  rooted: d => ({
    id: 'rooted', name: '缠绕', kind: 'debuff', duration: d, rooted: true, color: '#5ad04a',
    desc: '无法移动。',
  }),

  regen: (d, p = 3) => ({
    id: 'regen', name: '再生', kind: 'buff', duration: d, color: '#66ff88',
    desc: `每回合恢复 ${p} 点生命。`,
    onTurnEnd(u, g) { healUnit(g, u, p) },
  }),

  shielded: (d, p = 1) => ({
    id: 'shielded', name: '护盾', kind: 'buff', duration: d, color: '#c8d8ff',
    desc: '格挡受到的攻击。',
    onApply(u) { u.shields += p },
  }),

  hasted: d => ({
    id: 'hasted', name: '急速', kind: 'buff', duration: d, color: '#ffe019',
    desc: '每回合行动两次。',
  }),

  ironskin: d => resistBuff('ironskin', '铁肤', { physical: 50, fire: 50, lightning: 50 }, d, '#c8ccd8'),
  holy_armor: d => resistBuff('holy_armor', '圣光护甲', { dark: 100, physical: 25 }, d, '#fff5b0'),
  frost_ward: d => resistBuff('frost_ward', '霜护', { ice: 100, fire: -25 }, d, '#7fd8ff'),
  arcane_ward: d => resistBuff('arcane_ward', '奥术护盾', { arcane: 75, dark: 25 }, d, '#ff5cc8'),

  conductance: d => ({
    id: 'conductance', name: '导电', kind: 'debuff', duration: d, color: '#ffe019',
    resists: { lightning: -100 },
    desc: '受到双倍闪电伤害。',
  }),

  swift: d => ({
    id: 'swift', name: '迅捷', kind: 'buff', duration: d, color: '#9affc0',
    desc: '每回合移动两次，但仍只攻击一次。',
  }),

  melted: d => ({
    id: 'melted', name: '熔蚀', kind: 'debuff', duration: d, color: '#ff8f5a',
    resists: { physical: -50, fire: -50, ice: -50 },
    desc: '易受物理、火焰与冰霜伤害。',
  }),

  cursed: d => ({
    id: 'cursed', name: '诅咒', kind: 'debuff', duration: d, color: '#a05ad0',
    resists: { dark: -50, holy: -50 },
    desc: '易受黑暗与神圣伤害。',
  }),

  soul_marked: (d, p = 4) => ({
    id: 'soul_marked', name: '灵魂印记', kind: 'debuff', duration: d, color: '#d02b3a',
    desc: `死亡时引爆，造成 ${p} 点黑暗伤害。`,
    onDeath(u, g) {
      for (const t of unitsNear(g, u.x, u.y, 2, t => t.isHostileTo(u) || t.team === 'enemy')) {
        if (t === u) continue
        dealDamage(g, t, p, 'dark', u.summoner)
      }
      g.fx.burst(u.x, u.y, 2, '#a05ad0')
    },
  }),

  doomed: (d, p = 20) => ({
    id: 'doomed', name: '厄运', kind: 'debuff', duration: d, color: '#a05ad0',
    desc: `效果结束时受到 ${p} 点黑暗伤害。`,
    onExpire(u, g) { dealDamage(g, u, p, 'dark') },
  }),

  flame_aura: (d, p = 3) => auraBuff('flame_aura', '烈焰灵光', 'fire', p, 2, d),
  storm_aura: (d, p = 3) => auraBuff('storm_aura', '雷暴灵光', 'lightning', p, 2, d),
  frost_aura: (d, p = 3) => auraBuff('frost_aura', '寒霜灵光', 'ice', p, 2, d),
  toxic_aura: (d, p = 2) => auraBuff('toxic_aura', '剧毒灵光', 'poison', p, 2, d),

  enchanted: (d, p = 2) => ({
    id: 'enchanted', name: '强化', kind: 'buff', duration: d, color: '#ff5cc8',
    desc: `攻击 +${p} 伤害。`,
    onApply(u) { for (const a of u.attacks) if (a.damage) a.damage += p },
    onExpire(u) { for (const a of u.attacks) if (a.damage) a.damage = Math.max(1, a.damage - p) },
  }),

  vigor: (d, p = 10) => ({
    id: 'vigor', name: '活力', kind: 'buff', duration: d, color: '#9affc0', maxHPBonus: p,
    desc: `生命上限 +${p}。`,
  }),

  channeling: d => ({
    id: 'channeling', name: '引导中', kind: 'buff', duration: d, color: '#ffd0f0', hidden: false,
    desc: '正在重复施放法术。任何其他行动都会打断。',
  }),
}

export function makeBuff(id: string, duration: number, power?: number): Buff | undefined {
  const f = BUFFS[id]
  if (!f) return undefined
  return f(duration, power)
}

/** Every status effect a unit shows in the sidebar. */
export function visibleBuffs(u: Unit): Buff[] {
  return u.buffs.filter(b => !b.hidden && b.kind !== 'equip')
}
