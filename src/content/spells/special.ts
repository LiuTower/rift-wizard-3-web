import type { SpellDef, SpellInst, SpellStats, UpgradeDef } from '../../core/spell'
import type { Buff, Unit } from '../../core/unit'
import type { Game } from '../../core/game'
import type { DamageType, Tag } from '../../core/types'
import type { Shape, SpriteDef } from '../../render/sprite'
import { applyBuff, cleanse, dealDamage, healUnit, teleportUnit } from '../../core/combat'
import { makeBuff, resistBuff } from '../../core/buffs'
import { spawnCloud } from '../../core/clouds'
import { ballPoints, dist } from '../../core/geom'

// ------------------------------------------------------------- translocation

const blink: SpellDef = {
  id: 'blink', name: '闪现', level: 3, charges: 6,
  tags: ['sorcery', 'translocation'], icon: 'icon_blink', color: '#8affea',
  target: 'empty',
  stats: { range: 8, damage: 9, radius: 2, duration: 3, shields: 1 },
  desc(s) {
    const bits = [`穿过以太，移动到 ${s.range} 格内的任意空地。`]
    if (s.has('disperse')) bits.push(`离开的那格 ${s.radius} 格内的敌人受到 ${s.st('damage')} 点奥术伤害。`)
    if (s.has('phase')) bits.push(`获得 ${s.st('shields')} 点护盾，持续 ${s.duration} 回合。`)
    return bits.join('')
  },
  cast(s, g, x, y) {
    const ox = g.player.x, oy = g.player.y
    if (!teleportUnit(g, g.player, x, y)) {
      g.log('以太不肯分开。', '#8890a0')
      return
    }
    if (s.has('disperse')) {
      const tiles = ballPoints(ox, oy, s.radius)
      g.fx.area(tiles, '#ff5cc8')
      for (const p of tiles) {
        const u = g.level.unitAt(p.x, p.y)
        if (u && u.team === 'enemy') dealDamage(g, u, s.st('damage'), 'arcane', g.player, s)
      }
    }
    if (s.has('phase')) {
      const b = makeBuff('shielded', s.duration, s.st('shields'))
      if (b) applyBuff(g, g.player, b)
    }
  },
  upgrades: [
    { id: 'sightless', name: '盲视闪现', desc: '可闪现到射程内的任意格，即使看不见。', flag: 'sightless' },
    { id: 'far_blink', name: '长步', desc: '射程 +4。', mods: { range: 4 } },
    { id: 'disperse', name: '离散', desc: '离开的那格会炸开，伤及附近敌人。', flag: 'disperse' },
    { id: 'phase', name: '相位偏移', desc: '落地时带着护盾，挡下下一次命中。', flag: 'phase' },
  ],
}

const teleport: SpellDef = {
  id: 'teleport', name: '传送', level: 5, charges: 1,
  tags: ['sorcery', 'translocation'], icon: 'icon_teleport', color: '#8affea',
  target: 'empty', requiresLOS: false,
  stats: { range: 25, damage: 25, radius: 3, duration: 2, shields: 2 },
  desc(s) {
    const bits = [`撕开一道裂隙，出现在 ${s.range} 格内的任何地方，看得见与否皆可。`]
    if (s.has('cleanse')) bits.push('抵达时清除自身所有负面状态。')
    if (s.has('collapse')) bits.push(`裂隙塌缩，对出发点 ${s.radius} 格内造成 ${s.st('damage')} 点奥术伤害。`)
    if (s.has('ward')) bits.push(`抵达时带有 ${s.st('shields')} 点护盾。`)
    if (s.has('momentum')) bits.push(`获得急速，持续 ${s.duration} 回合。`)
    return bits.join('')
  },
  cast(s, g, x, y) {
    const ox = g.player.x, oy = g.player.y
    if (!teleportUnit(g, g.player, x, y)) {
      g.log('裂隙猛然闭合。', '#8890a0')
      return
    }
    g.fx.ring(x, y, 2, '#8affea')
    if (s.has('collapse')) {
      const tiles = ballPoints(ox, oy, s.radius)
      g.fx.area(tiles, '#ff5cc8')
      for (const p of tiles) {
        const u = g.level.unitAt(p.x, p.y)
        if (u && u.team === 'enemy') dealDamage(g, u, s.st('damage'), 'arcane', g.player, s)
      }
    }
    if (s.has('cleanse')) {
      const n = cleanse(g, g.player)
      if (n > 0) g.log(`裂隙洗去了 ${n} 个负面状态。`, '#8affea')
    }
    if (s.has('ward')) {
      const b = makeBuff('shielded', s.duration + 2, s.st('shields'))
      if (b) applyBuff(g, g.player, b)
    }
    if (s.has('momentum')) {
      const b = makeBuff('hasted', s.duration)
      if (b) applyBuff(g, g.player, b)
    }
  },
  upgrades: [
    { id: 'cleanse', name: '净化裂隙', desc: '抵达时清除自身所有负面状态。', flag: 'cleanse' },
    { id: 'collapse', name: '裂隙塌缩', desc: '离开的那格向内塌陷，造成奥术伤害。', flag: 'collapse' },
    { id: 'ward', name: '护盾出口', desc: '抵达时带有护盾。', flag: 'ward' },
    { id: 'momentum', name: '惯性', desc: '抵达时获得急速。', flag: 'momentum' },
  ],
}

const aetherSwap: SpellDef = {
  id: 'aether_swap', name: '以太换位', level: 3, charges: 8,
  tags: ['sorcery', 'translocation', 'arcane'], icon: 'icon_aether_swap', color: '#ff5cc8',
  target: 'unit',
  stats: { range: 15, damage: 13, duration: 1 },
  canTarget(s, g, x, y) {
    const u = g.level.unitAt(x, y)
    return !!u && u !== g.player
  },
  desc(s) {
    const bits = [`与 ${s.range} 格内的任意生物交换位置。`]
    if (s.has('siphon')) bits.push(`它在穿行途中受到 ${s.st('damage')} 点奥术伤害。`)
    if (s.has('disorient')) bits.push(`敌人抵达时眩晕 ${s.duration} 回合。`)
    return bits.join('')
  },
  cast(s, g, x, y) {
    const other = g.level.unitAt(x, y)
    if (!other || other === g.player) return
    const px = g.player.x, py = g.player.y
    if (!g.level.passable(x, y, g.player.flying) || !g.level.passable(px, py, other.flying)) {
      g.log('这样落地，两个都活不下来。', '#8890a0')
      return
    }
    g.fx.beam(px, py, x, y, '#ff5cc8')
    g.fx.teleport(px, py, x, y, g.player.color)
    g.fx.teleport(x, y, px, py, other.color)
    // Move the passenger first: that frees the target tile before the wizard lands.
    g.level.placeUnit(other, px, py)
    g.level.placeUnit(g.player, x, y)
    g.level.invalidateLOS()
    for (const b of other.buffs.slice()) b.onMove?.(other, g, x, y)
    for (const b of g.player.buffs.slice()) b.onMove?.(g.player, g, px, py)
    if (other.team === 'enemy') {
      if (s.has('siphon')) dealDamage(g, other, s.st('damage'), 'arcane', g.player, s)
      if (s.has('disorient') && other.alive) {
        const b = makeBuff('stunned', Math.max(1, s.duration))
        if (b) applyBuff(g, other, b)
      }
    }
    g.checkTileEffects(other)
    g.checkTileEffects(g.player)
  },
  upgrades: [
    { id: 'sightless', name: '盲目换位', desc: '可与看不见的生物交换位置。', flag: 'sightless' },
    { id: 'far_swap', name: '远程交易', desc: '射程 +6。', mods: { range: 6 } },
    { id: 'siphon', name: '以太虹吸', desc: '与你交换位置的生物受到奥术伤害。', flag: 'siphon' },
    { id: 'disorient', name: '迷向', desc: '被交换的敌人抵达时眩晕。', flag: 'disorient' },
  ],
}

// ------------------------------------------------------------------ the eyes

interface EyeCfg {
  id: string
  name: string
  element: Tag
  type: DamageType
  /** Chinese name of the damage type, used by the shared blurb */
  typeLabel: string
  color: string
  /** engine buff id rolled on a proc */
  status: string
  /** player-facing verb for the proc, e.g. "使其燃烧" */
  statusVerb: string
  stats: SpellStats
  /** the two upgrades unique to this eye */
  extras: [UpgradeDef, UpgradeDef]
  /** damage multiplier granted by an upgrade */
  amplify?: (s: SpellInst, t: Unit) => number
  /** extra effect after the hit landed */
  rider?: (s: SpellInst, g: Game, t: Unit) => void
}

/** One sentence shared by the spellbook entry and the live buff, so they never drift. */
function eyeStrike(s: SpellInst, cfg: EyeCfg): string {
  const n = Math.max(1, s.st('num_targets'))
  // The plural branch opens with a digit, so it carries its own leading space.
  const who = n > 1 ? ` ${n} 名随机敌人` : '一名随机敌人'
  return `每回合打击 ${s.range} 格内视线可见的${who}，造成 ${s.st('damage')} 点${cfg.typeLabel}伤害，有 ${s.st('proc')}% 的概率${cfg.statusVerb}`
}

/** All four eyes share this shape so they read, scale and upgrade identically. */
function makeEye(cfg: EyeCfg): SpellDef {
  return {
    id: cfg.id, name: cfg.name, level: 2, charges: 4,
    tags: ['enchantment', 'eye', cfg.element], icon: `icon_${cfg.id}`, color: cfg.color,
    target: 'self',
    stats: cfg.stats,
    desc: s => `开启${cfg.name}，持续 ${s.duration} 回合：${eyeStrike(s, cfg)}。`,
    cast(s, game) {
      const text = `眼魔注视着：${eyeStrike(s, cfg)}。`
      const eye: Buff = {
        id: cfg.id, name: cfg.name, kind: 'buff', duration: s.duration, color: cfg.color, desc: text,
        onTurnEnd(u, g) {
          const reach = s.range
          const pool = g.level.units.filter(t =>
            t.alive && t.team === 'enemy'
            && dist(u.x, u.y, t.x, t.y) <= reach + 0.001
            && g.level.hasLOS(u.x, u.y, t.x, t.y))
          if (pool.length === 0) return
          for (const t of g.rng.sample(pool, Math.max(1, s.st('num_targets')))) {
            if (!t.alive) continue
            const mul = cfg.amplify ? cfg.amplify(s, t) : 1
            g.fx.beam(u.x, u.y, t.x, t.y, cfg.color, mul > 1 ? 2 : 1)
            dealDamage(g, t, s.st('damage') * mul, cfg.type, u, s)
            if (!t.alive) continue
            if (g.rng.chance(s.st('proc') / 100)) {
              const b = makeBuff(cfg.status, Math.max(1, s.st('status_duration')))
              if (b) applyBuff(g, t, b)
            }
            if (t.alive) cfg.rider?.(s, g, t)
          }
        },
      }
      // Re-opening an eye refreshes it; keep the numbers it shows current too.
      const cur = applyBuff(game, game.player, eye)
      if (cur) cur.desc = text
      game.fx.ring(game.player.x, game.player.y, 2, cfg.color)
      game.log(`${cfg.name}睁开了。`, cfg.color)
    },
    upgrades: [
      { id: 'focus', name: '专注凝视', desc: '每次打击伤害 +3。', mods: { damage: 3 } },
      { id: 'vigil', name: '长守', desc: '持续时间 +6 回合。', mods: { duration: 6 } },
      cfg.extras[0],
      cfg.extras[1],
    ],
  }
}

const EYE_BASE: SpellStats = { damage: 5, duration: 10, range: 10, num_targets: 1, proc: 25, status_duration: 2 }

const eyeOfFire = makeEye({
  id: 'eye_of_fire', name: '火焰之眼', element: 'fire', type: 'fire', typeLabel: '火焰', color: '#ff5219',
  status: 'burning', statusVerb: '使其燃烧',
  stats: { ...EYE_BASE },
  extras: [
    { id: 'kindle', name: '引火', desc: '点燃概率大幅提升，火也烧得更久。', mods: { proc: 50, status_duration: 1 } },
    { id: 'twin_flame', name: '双焰', desc: '眼魔每回合多打击一名敌人。', mods: { num_targets: 1 } },
  ],
})

const eyeOfLightning = makeEye({
  id: 'eye_of_lightning', name: '闪电之眼', element: 'lightning', type: 'lightning', typeLabel: '闪电', color: '#ffe019',
  status: 'stunned', statusVerb: '使其眩晕',
  stats: { ...EYE_BASE, status_duration: 1 },
  extras: [
    { id: 'overload', name: '过载', desc: '眩晕概率大幅提升。', mods: { proc: 50 } },
    { id: 'far_sight', name: '风暴视界', desc: '射程 +6。', mods: { range: 6 } },
  ],
})

const eyeOfIce = makeEye({
  id: 'eye_of_ice', name: '冰霜之眼', element: 'ice', type: 'ice', typeLabel: '冰霜', color: '#7fd8ff',
  status: 'frozen', statusVerb: '使其冰冻',
  stats: { ...EYE_BASE },
  amplify: (s, t) => (s.has('shatter') && t.hasBuff('frozen') ? 2 : 1),
  extras: [
    { id: 'deepfreeze', name: '深度冰封', desc: '冰冻概率大幅提升，冰封也持续更久。', mods: { proc: 50, status_duration: 1 } },
    { id: 'shatter', name: '碎裂', desc: '对已被冰冻的敌人造成双倍伤害。', flag: 'shatter' },
  ],
})

const eyeOfRage = makeEye({
  id: 'eye_of_rage', name: '暴怒之眼', element: 'dark', type: 'physical', typeLabel: '物理', color: '#d02b3a',
  status: 'berserk', statusVerb: '使其狂暴',
  stats: { ...EYE_BASE },
  rider(s, g, t) {
    if (!s.has('lacerate')) return
    const b = makeBuff('bleeding', Math.max(1, s.st('status_duration')))
    if (b) applyBuff(g, t, b)
  },
  extras: [
    { id: 'frenzy', name: '狂乱', desc: '使目标狂暴的概率大幅提升。', mods: { proc: 50 } },
    { id: 'lacerate', name: '撕裂', desc: '被打击的敌人还会流血。', flag: 'lacerate' },
  ],
})

// ---------------------------------------------------------- self enchantments

const mysticPower: SpellDef = {
  id: 'mystic_power', name: '秘能加持', level: 3, charges: 7,
  tags: ['enchantment', 'arcane'], icon: 'icon_mystic_power', color: '#ff5cc8',
  target: 'self',
  stats: { damage: 6, duration: 5, curse_duration: 3 },
  desc(s) {
    const bits = [`在 ${s.duration} 回合内，你施放的每个法术都额外造成 ${s.st('damage')} 点伤害。`]
    if (s.has('hex')) bits.push(`你的法术还会诅咒目标 ${s.st('curse_duration')} 回合。`)
    if (s.has('resolve')) bits.push('同时获得同等时长的铁肤。')
    return bits.join('')
  },
  cast(s, game) {
    const text = `你的法术额外造成 ${s.st('damage')} 点伤害。`
    const power: Buff = {
      id: 'mystic_power', name: '秘能加持', kind: 'buff', duration: s.duration, color: '#ff5cc8', desc: text,
      modifyOutgoing(u, g, ev) {
        if (!ev.spell || ev.target === u) return
        ev.amount += s.st('damage')
        if (s.has('hex') && ev.target.alive) {
          const b = makeBuff('cursed', Math.max(1, s.st('curse_duration')))
          if (b) applyBuff(g, ev.target, b)
        }
      },
    }
    const cur = applyBuff(game, game.player, power)
    if (cur) cur.desc = text
    if (s.has('resolve')) {
      const b = makeBuff('ironskin', s.duration)
      if (b) applyBuff(game, game.player, b)
    }
    game.fx.ring(game.player.x, game.player.y, 2, '#ff5cc8')
    game.log('力量涌入双手。', '#ff5cc8')
  },
  upgrades: [
    { id: 'mighty', name: '压倒性', desc: '额外伤害 +3。', mods: { damage: 3 } },
    { id: 'lasting', name: '持久', desc: '持续时间 +3 回合。', mods: { duration: 3 } },
    { id: 'hex', name: '妖术之力', desc: '被强化的法术会诅咒命中的目标。', flag: 'hex' },
    { id: 'resolve', name: '铁之决意', desc: '持续期间同时获得铁肤。', flag: 'resolve' },
  ],
}

const holyArmor: SpellDef = {
  id: 'holy_armor', name: '圣光护甲', level: 3, charges: 6,
  tags: ['enchantment', 'holy'], icon: 'icon_holy_armor', color: '#fff5b0',
  target: 'self',
  stats: { duration: 8, shields: 1, heal: 3 },
  desc(s) {
    const sh = s.st('shields')
    const bits = [`在 ${s.duration} 回合内免疫黑暗伤害、抗物理伤害，并带有 ${sh} 点护盾。`]
    if (s.has('cleansing')) bits.push('施放时烧尽自身所有负面状态。')
    if (s.has('sanctuary')) bits.push(`每回合还恢复 ${s.st('heal')} 点生命。`)
    return bits.join('')
  },
  cast(s, g) {
    const d = s.duration
    const armor = makeBuff('holy_armor', d)
    if (armor) applyBuff(g, g.player, armor)
    const shields = s.st('shields')
    if (shields > 0) {
      const b = makeBuff('shielded', d, shields)
      if (b) applyBuff(g, g.player, b)
    }
    if (s.has('cleansing')) {
      const n = cleanse(g, g.player)
      if (n > 0) g.log(`圣光烧尽了 ${n} 个负面状态。`, '#fff5b0')
    }
    if (s.has('sanctuary')) {
      const b = makeBuff('regen', d, s.st('heal'))
      if (b) applyBuff(g, g.player, b)
    }
    g.fx.ring(g.player.x, g.player.y, 2, '#fff5b0')
    g.log('金色甲片覆上身来。', '#fff5b0')
  },
  upgrades: [
    { id: 'lasting', name: '不渝信仰', desc: '持续时间 +6 回合。', mods: { duration: 6 } },
    { id: 'bulwark', name: '壁垒', desc: '护盾 +2。', mods: { shields: 2 } },
    { id: 'cleansing', name: '净化之光', desc: '施放时清除自身所有负面状态。', flag: 'cleansing' },
    { id: 'sanctuary', name: '圣所', desc: '护甲存续期间持续恢复生命。', flag: 'sanctuary' },
  ],
}

const ironize: SpellDef = {
  id: 'ironize', name: '铁化', level: 3, charges: 5,
  tags: ['enchantment', 'metallic'], icon: 'icon_ironize', color: '#c8ccd8',
  target: 'self',
  stats: { duration: 8, shields: 0, damage: 7 },
  desc(s) {
    const bits = [`皮肤化为铁，持续 ${s.duration} 回合：物理、火焰与闪电抗性 50%。`]
    if (s.has('alloy')) bits.push('这层合金还能挡开冰霜与奥术伤害。')
    if (s.st('shields') > 0) bits.push(`获得 ${s.st('shields')} 点护盾。`)
    if (s.has('barbs')) bits.push(`相邻的攻击者受到 ${s.st('damage')} 点物理伤害。`)
    return bits.join('')
  },
  cast(s, game) {
    const d = s.duration
    const skin = makeBuff('ironskin', d)
    if (skin) applyBuff(game, game.player, skin)
    if (s.has('alloy')) {
      applyBuff(game, game.player, resistBuff('iron_alloy', '铁合金', { ice: 50, arcane: 50 }, d, '#c8ccd8'))
    }
    const shields = s.st('shields')
    if (shields > 0) {
      const b = makeBuff('shielded', d, shields)
      if (b) applyBuff(game, game.player, b)
    }
    if (s.has('barbs')) {
      applyBuff(game, game.player, {
        id: 'iron_barbs', name: '铁刺', kind: 'buff', duration: d, color: '#c8ccd8',
        desc: `相邻的攻击者受到 ${s.st('damage')} 点物理伤害。`,
        onHurt(u, g, ev) {
          const src = ev.source
          if (!src || !src.alive || src === u) return
          if (dist(u.x, u.y, src.x, src.y) > 1.5) return
          g.fx.flash(src.x, src.y, '#c8ccd8')
          dealDamage(g, src, s.st('damage'), 'physical', u, s)
        },
      })
    }
    game.fx.ring(game.player.x, game.player.y, 2, '#c8ccd8')
    game.log('你的皮肤像钟一样鸣响。', '#c8ccd8')
  },
  upgrades: [
    { id: 'lasting', name: '淬炼', desc: '持续时间 +6 回合。', mods: { duration: 6 } },
    { id: 'plating', name: '镀板', desc: '护盾 +2。', mods: { shields: 2 } },
    { id: 'alloy', name: '霜铁合金', desc: '同时抗冰霜与奥术伤害。', flag: 'alloy' },
    { id: 'barbs', name: '倒刺装甲', desc: '相邻的攻击者会在你身上划伤自己。', flag: 'barbs' },
  ],
}

const painMirror: SpellDef = {
  id: 'pain_mirror', name: '痛苦之镜', level: 4, charges: 1,
  tags: ['enchantment', 'dark', 'blood'], icon: 'icon_pain_mirror', color: '#d02b3a',
  target: 'self', hpCost: 5,
  stats: { duration: 8, reflect: 50, heal: 2, status_duration: 3 },
  desc(s) {
    const bits = [`在 ${s.duration} 回合内，伤到你的一切都会按这份伤害的 ${s.st('reflect')}% 承受黑暗伤害。`]
    if (s.has('vampiric')) bits.push(`每次反射为你恢复 ${s.st('heal')} 点生命。`)
    if (s.has('spite')) bits.push(`被反射的攻击者流血 ${s.st('status_duration')} 回合。`)
    return bits.join('')
  },
  cast(s, game) {
    const text = `将你所受伤害的 ${s.st('reflect')}% 作为黑暗伤害返还。`
    // A reflection must never reflect: this guard closes the loop for good.
    let reflecting = false
    const mirror: Buff = {
      id: 'pain_mirror', name: '痛苦之镜', kind: 'buff', duration: s.duration, color: '#d02b3a', desc: text,
      onHurt(u, g, ev) {
        if (reflecting) return
        const src = ev.source
        if (!src || !src.alive || src === u) return
        const back = Math.floor(ev.amount * s.st('reflect') / 100)
        if (back <= 0) return
        reflecting = true
        try {
          g.fx.beam(u.x, u.y, src.x, src.y, '#d02b3a')
          dealDamage(g, src, back, 'dark', u, s)
          if (s.has('spite') && src.alive) {
            const b = makeBuff('bleeding', Math.max(1, s.st('status_duration')))
            if (b) applyBuff(g, src, b)
          }
          if (s.has('vampiric')) healUnit(g, u, s.st('heal'))
        } finally {
          reflecting = false
        }
      },
    }
    const cur = applyBuff(game, game.player, mirror)
    if (cur) cur.desc = text
    game.fx.ring(game.player.x, game.player.y, 2, '#d02b3a')
    game.log('你的伤口朝外张开。', '#d02b3a')
  },
  upgrades: [
    { id: 'deeper', name: '更深的割痕', desc: '反射伤害 +25%。', mods: { reflect: 25 } },
    { id: 'lasting', name: '余怨', desc: '持续时间 +4 回合。', mods: { duration: 4 } },
    { id: 'vampiric', name: '吸血之镜', desc: '每次反射都为你回复生命。', flag: 'vampiric' },
    { id: 'spite', name: '怨毒', desc: '被反射的攻击者会流血。', flag: 'spite' },
  ],
}

// ---------------------------------------------------------------- word spells

const wordOfIce: SpellDef = {
  id: 'word_of_ice', name: '冰霜言灵', level: 7, charges: 1,
  tags: ['sorcery', 'word', 'ice'], icon: 'icon_word_of_ice', color: '#7fd8ff',
  target: 'self',
  stats: { damage: 45, duration: 3, cloud_duration: 4 },
  desc(s) {
    const bits = [`说出寒冷之名：对领域内每个敌人造成 ${s.st('damage')} 点冰霜伤害，再使幸存者冰冻 ${s.duration} 回合。`]
    if (s.has('shatter')) bits.push(`已被冰冻的敌人冰层崩裂，额外承受 ${s.st('damage')} 点物理伤害。`)
    if (s.has('blizzard')) bits.push(`暴风雪笼罩它们各自的位置 ${s.st('cloud_duration')} 回合。`)
    return bits.join('')
  },
  cast(s, g) {
    const targets = g.level.units.filter(u => u.alive && u.team === 'enemy')
    g.fx.ring(g.player.x, g.player.y, 6, '#7fd8ff')
    g.fx.area(targets.map(u => ({ x: u.x, y: u.y })), '#7fd8ff')
    g.log('你说出寒冷之名。整个领域停止了呼吸。', '#7fd8ff')
    for (const u of targets) {
      if (!u.alive) continue
      // Damage lands before the freeze, or the ice would blunt its own word.
      const wasFrozen = u.hasBuff('frozen')
      dealDamage(g, u, s.st('damage'), 'ice', g.player, s)
      if (wasFrozen && u.alive && s.has('shatter')) {
        dealDamage(g, u, s.st('damage'), 'physical', g.player, s)
      }
      if (!u.alive) continue
      const frost = makeBuff('frozen', Math.max(1, s.duration))
      if (frost) applyBuff(g, u, frost)
      if (s.has('blizzard')) spawnCloud(g, 'blizzard', u.x, u.y, s.st('cloud_duration'), undefined, 'player')
    }
  },
  upgrades: [
    { id: 'deep', name: '绝对零度', desc: '冰霜伤害 +15。', mods: { damage: 15 } },
    { id: 'endless', name: '无尽寒冬', desc: '冰冻时间 +2 回合。', mods: { duration: 2 } },
    { id: 'shatter', name: '碎裂言灵', desc: '已被冰冻的敌人还会承受沉重的物理伤害。', flag: 'shatter' },
    { id: 'blizzard', name: '雪幕', desc: '暴风雪埋葬每个被命中的敌人。', flag: 'blizzard' },
  ],
}

const wordOfChaos: SpellDef = {
  id: 'word_of_chaos', name: '混乱言灵', level: 7, charges: 1,
  tags: ['sorcery', 'word', 'chaos'], icon: 'icon_word_of_chaos', color: '#ff7a4a',
  target: 'self',
  stats: { damage: 16, duration: 1, cloud_duration: 4 },
  desc(s) {
    const d = s.st('damage')
    const bits = [`说出破碎之名：将领域内每个敌人抛到随机的格子，再各造成 ${d} 点火焰、${d} 点闪电与 ${d} 点物理伤害。`]
    if (s.has('unmaking')) bits.push(`它们还会承受 ${d} 点奥术与 ${d} 点黑暗伤害。`)
    if (s.has('scatter')) bits.push(`落地会使它们眩晕 ${s.duration} 回合。`)
    if (s.has('pyre')) bits.push(`火焰云填满它们原先所在的格子，持续 ${s.st('cloud_duration')} 回合。`)
    return bits.join('')
  },
  cast(s, g) {
    const targets = g.level.units.filter(u => u.alive && u.team === 'enemy')
    // Reserve distinct landing tiles up front so nobody lands on top of a friend.
    const spots = g.rng.shuffle([...g.level.floorTiles()].filter(p => g.level.vacant(p.x, p.y)))
    const types: DamageType[] = s.has('unmaking')
      ? ['fire', 'lightning', 'physical', 'arcane', 'dark']
      : ['fire', 'lightning', 'physical']
    g.fx.ring(g.player.x, g.player.y, 6, '#ff7a4a')
    g.log('你说出破碎之名。整个领域四分五裂。', '#ff7a4a')
    for (const u of targets) {
      if (!u.alive) continue
      const ox = u.x, oy = u.y
      const spot = spots.pop()
      if (spot) teleportUnit(g, u, spot.x, spot.y)
      if (s.has('pyre')) spawnCloud(g, 'fire', ox, oy, s.st('cloud_duration'), undefined, 'player')
      for (const t of types) {
        if (!u.alive) break
        dealDamage(g, u, s.st('damage'), t, g.player, s)
      }
      if (u.alive && s.has('scatter')) {
        const b = makeBuff('stunned', Math.max(1, s.duration))
        if (b) applyBuff(g, u, b)
      }
    }
  },
  upgrades: [
    { id: 'fury', name: '无束之怒', desc: '每种伤害 +6。', mods: { damage: 6 } },
    { id: 'scatter', name: '硬着陆', desc: '被抛出的敌人落地时眩晕。', flag: 'scatter' },
    { id: 'pyre', name: '混乱柴堆', desc: '火焰云标记每个敌人原先站立的位置。', flag: 'pyre' },
    { id: 'unmaking', name: '解构', desc: '为这道言灵追加奥术与黑暗伤害。', flag: 'unmaking' },
  ],
}

export const spells: SpellDef[] = [
  blink, teleport, aetherSwap,
  eyeOfFire, eyeOfLightning, eyeOfIce, eyeOfRage,
  mysticPower, holyArmor, ironize, painMirror,
  wordOfIce, wordOfChaos,
]

// ------------------------------------------------------------------- sprites

/** Shared eye silhouette so the four eyes are unmistakably a set. */
function eyeIcon(dark: string, bright: string, pupil: Shape[]): SpriteDef {
  return {
    palette: [dark, bright, '#0d0c14', '#ffffff'],
    shapes: [
      { t: 'ellipse', x: 0.5, y: 0.5, rx: 0.43, ry: 0.29, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'circle', x: 0.5, y: 0.5, r: 0.19, fill: '$2', stroke: '$1', w: 0.03 },
      ...pupil,
      { t: 'arc', x: 0.5, y: 0.58, r: 0.36, a0: 3.55, a1: 5.87, stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.4, y: 0.42, r: 0.034, fill: '$3' },
      { t: 'line', pts: [0.05, 0.5, 0.13, 0.5], stroke: '$1', w: 0.03 },
      { t: 'line', pts: [0.87, 0.5, 0.95, 0.5], stroke: '$1', w: 0.03 },
    ],
  }
}

export const sprites: Record<string, SpriteDef> = {
  icon_blink: {
    palette: ['#123a3a', '#8affea', '#e8fffb'],
    shapes: [
      { t: 'poly', pts: [0.26, 0.22, 0.37, 0.5, 0.26, 0.78, 0.15, 0.5], fill: '$0', stroke: '$1', w: 0.028 },
      { t: 'poly', pts: [0.72, 0.14, 0.89, 0.5, 0.72, 0.86, 0.55, 0.5], fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'poly', pts: [0.72, 0.34, 0.81, 0.5, 0.72, 0.66, 0.63, 0.5], fill: '$1' },
      { t: 'line', pts: [0.34, 0.4, 0.47, 0.35], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.35, 0.62, 0.48, 0.67], stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.72, y: 0.5, r: 0.045, fill: '$2' },
    ],
  },
  icon_teleport: {
    palette: ['#0e2c3a', '#8affea', '#ffffff'],
    shapes: [
      { t: 'circle', x: 0.5, y: 0.5, r: 0.4, fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'arc', x: 0.5, y: 0.5, r: 0.29, a0: 0.45, a1: 5.2, stroke: '$1', w: 0.04 },
      { t: 'arc', x: 0.5, y: 0.5, r: 0.17, a0: 2.3, a1: 6.7, stroke: '$2', w: 0.035 },
      { t: 'circle', x: 0.5, y: 0.5, r: 0.07, fill: '$2' },
      { t: 'line', pts: [0.5, 0.02, 0.5, 0.12], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.5, 0.88, 0.5, 0.98], stroke: '$1', w: 0.035 },
    ],
  },
  icon_aether_swap: {
    palette: ['#2a1440', '#ff5cc8', '#8affea', '#ffffff'],
    shapes: [
      { t: 'circle', x: 0.28, y: 0.68, r: 0.14, fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.72, y: 0.32, r: 0.14, fill: '$0', stroke: '$2', w: 0.04 },
      { t: 'arc', x: 0.5, y: 0.5, r: 0.33, a0: 3.35, a1: 5.05, stroke: '$1', w: 0.045 },
      { t: 'arc', x: 0.5, y: 0.5, r: 0.33, a0: 0.2, a1: 1.9, stroke: '$2', w: 0.045 },
      { t: 'poly', pts: [0.68, 0.14, 0.82, 0.2, 0.7, 0.28], fill: '$1' },
      { t: 'poly', pts: [0.32, 0.86, 0.18, 0.8, 0.3, 0.72], fill: '$2' },
      { t: 'circle', x: 0.5, y: 0.5, r: 0.04, fill: '$3' },
    ],
  },
  icon_eye_of_fire: eyeIcon('#4a1508', '#ff5219', [
    { t: 'poly', pts: [0.5, 0.33, 0.58, 0.47, 0.54, 0.62, 0.46, 0.62, 0.42, 0.47], fill: '$1' },
  ]),
  icon_eye_of_lightning: eyeIcon('#4a3a06', '#ffe019', [
    { t: 'poly', pts: [0.55, 0.33, 0.45, 0.49, 0.52, 0.49, 0.44, 0.67, 0.58, 0.46, 0.5, 0.46], fill: '$1' },
  ]),
  icon_eye_of_ice: eyeIcon('#123a4a', '#7fd8ff', [
    { t: 'poly', pts: [0.5, 0.34, 0.59, 0.42, 0.59, 0.58, 0.5, 0.66, 0.41, 0.58, 0.41, 0.42], fill: '$1' },
    { t: 'line', pts: [0.44, 0.44, 0.56, 0.56], stroke: '$2', w: 0.025 },
  ]),
  icon_eye_of_rage: eyeIcon('#3a0a12', '#d02b3a', [
    { t: 'ellipse', x: 0.5, y: 0.5, rx: 0.048, ry: 0.16, fill: '$1' },
    { t: 'line', pts: [0.24, 0.2, 0.42, 0.3, 0.58, 0.3, 0.76, 0.2], stroke: '$1', w: 0.04 },
  ]),
  icon_mystic_power: {
    palette: ['#3a1240', '#ff5cc8', '#ffd0f0'],
    shapes: [
      { t: 'blob', x: 0.5, y: 0.52, r: 0.27, lobes: 6, fill: '$0', stroke: '$1', w: 0.045 },
      { t: 'poly', pts: [0.5, 0.28, 0.57, 0.46, 0.74, 0.52, 0.57, 0.58, 0.5, 0.76, 0.43, 0.58, 0.26, 0.52, 0.43, 0.46], fill: '$1', stroke: '$2', w: 0.02 },
      { t: 'line', pts: [0.5, 0.14, 0.5, 0.02], stroke: '$2', w: 0.035 },
      { t: 'line', pts: [0.86, 0.52, 0.98, 0.52], stroke: '$2', w: 0.035 },
      { t: 'line', pts: [0.14, 0.52, 0.02, 0.52], stroke: '$2', w: 0.035 },
      { t: 'circle', x: 0.5, y: 0.52, r: 0.05, fill: '$2' },
    ],
  },
  icon_holy_armor: {
    palette: ['#3a3418', '#fff5b0', '#ffffff'],
    shapes: [
      { t: 'poly', pts: [0.5, 0.1, 0.84, 0.24, 0.78, 0.62, 0.5, 0.9, 0.22, 0.62, 0.16, 0.24], fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'line', pts: [0.5, 0.24, 0.5, 0.74], stroke: '$1', w: 0.055 },
      { t: 'line', pts: [0.3, 0.42, 0.7, 0.42], stroke: '$1', w: 0.055 },
      { t: 'arc', x: 0.5, y: 0.5, r: 0.45, a0: 3.75, a1: 5.68, stroke: '$2', w: 0.03 },
      { t: 'circle', x: 0.34, y: 0.3, r: 0.04, fill: '$2' },
    ],
  },
  icon_ironize: {
    palette: ['#2a2c34', '#c8ccd8', '#767a86'],
    shapes: [
      { t: 'poly', pts: [0.5, 0.1, 0.83, 0.3, 0.83, 0.68, 0.5, 0.9, 0.17, 0.68, 0.17, 0.3], fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'poly', pts: [0.5, 0.28, 0.68, 0.39, 0.68, 0.61, 0.5, 0.72, 0.32, 0.61, 0.32, 0.39], fill: '$2', stroke: '$1', w: 0.03 },
      { t: 'circle', x: 0.26, y: 0.34, r: 0.035, fill: '$1' },
      { t: 'circle', x: 0.74, y: 0.34, r: 0.035, fill: '$1' },
      { t: 'circle', x: 0.26, y: 0.64, r: 0.035, fill: '$1' },
      { t: 'circle', x: 0.74, y: 0.64, r: 0.035, fill: '$1' },
    ],
  },
  icon_pain_mirror: {
    palette: ['#2a0c14', '#d02b3a', '#ff9aa8'],
    shapes: [
      { t: 'ellipse', x: 0.5, y: 0.42, rx: 0.3, ry: 0.34, fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'line', pts: [0.5, 0.76, 0.5, 0.95], stroke: '$1', w: 0.06 },
      { t: 'line', pts: [0.42, 0.14, 0.55, 0.4, 0.44, 0.5, 0.58, 0.7], stroke: '$2', w: 0.035 },
      { t: 'arc', x: 0.5, y: 0.42, r: 0.2, a0: 3.4, a1: 4.6, stroke: '$2', w: 0.03 },
      { t: 'circle', x: 0.63, y: 0.82, r: 0.05, fill: '$1' },
    ],
  },
  icon_word_of_ice: {
    palette: ['#123444', '#7fd8ff', '#ffffff'],
    shapes: [
      { t: 'circle', x: 0.5, y: 0.5, r: 0.26, fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'poly', pts: [0.5, 0.31, 0.61, 0.5, 0.5, 0.69, 0.39, 0.5], fill: '$1', stroke: '$2', w: 0.02 },
      { t: 'poly', pts: [0.5, 0.02, 0.57, 0.24, 0.43, 0.24], fill: '$0', stroke: '$1', w: 0.03 },
      { t: 'poly', pts: [0.5, 0.98, 0.57, 0.76, 0.43, 0.76], fill: '$0', stroke: '$1', w: 0.03 },
      { t: 'poly', pts: [0.02, 0.5, 0.24, 0.43, 0.24, 0.57], fill: '$0', stroke: '$1', w: 0.03 },
      { t: 'poly', pts: [0.98, 0.5, 0.76, 0.43, 0.76, 0.57], fill: '$0', stroke: '$1', w: 0.03 },
      { t: 'circle', x: 0.43, y: 0.42, r: 0.035, fill: '$2' },
    ],
  },
  icon_word_of_chaos: {
    palette: ['#3a1a10', '#ff7a4a', '#ffe019', '#ffffff'],
    shapes: [
      { t: 'blob', x: 0.5, y: 0.5, r: 0.27, lobes: 7, fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'poly', pts: [0.5, 0.32, 0.63, 0.44, 0.57, 0.62, 0.43, 0.62, 0.37, 0.44], fill: '$1' },
      { t: 'line', pts: [0.68, 0.28, 0.8, 0.2, 0.74, 0.1], stroke: '$2', w: 0.035 },
      { t: 'line', pts: [0.32, 0.72, 0.2, 0.8, 0.26, 0.92], stroke: '$2', w: 0.035 },
      { t: 'line', pts: [0.72, 0.7, 0.86, 0.78, 0.82, 0.9], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.28, 0.3, 0.14, 0.22, 0.18, 0.1], stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.5, y: 0.5, r: 0.045, fill: '$3' },
    ],
  },
}
