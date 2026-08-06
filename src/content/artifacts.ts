import type { ArtifactDef } from '../core/crafting'
import type { Buff } from '../core/unit'
import { COMPONENTS, type ComponentId } from '../core/types'
import type { Shape, SpriteDef } from '../render/sprite'
import { applyBuff, dealDamage, healUnit, unitsNear } from '../core/combat'
import { makeBuff } from '../core/buffs'
import { spawnCloud } from '../core/clouds'
import { cheb } from '../core/geom'

/**
 * Crafted artifacts: the series has no passive skill tree, so every permanent
 * upgrade lives here. Recipes are paid in components: tier 1 costs 2-3, tier 2
 * costs 4-5, tier 3 costs 6-8, always weighted toward the thematic component.
 */

const COMPONENT_LETTERS: ComponentId[] = ['U', 'T', 'C', 'H', 'B', 'I', 'S', 'O']

// ------------------------------------------------------------------- triggers

/** Fire spells pass their heat on to whoever is standing closest. */
function emberfangBuff(): Buff {
  return {
    id: 'art_emberfang', name: '烬牙手套', kind: 'equip', duration: -1, color: '#ff8f5a',
    desc: '施放火焰法术时点燃附近一名敌人。',
    onCast(u, g, s) {
      if (!s.tags.includes('fire')) return
      const foes = unitsNear(g, u.x, u.y, 6, t => t.team === 'enemy')
      if (!foes.length) return
      const fresh = foes.filter(t => !t.hasBuff('burning'))
      const victim = g.rng.pick(fresh.length ? fresh : foes)
      const b = makeBuff('burning', 3, 2)
      if (!b) return
      g.fx.bolt(u.x, u.y, victim.x, victim.y, '#ff8f5a')
      applyBuff(g, victim, b)
    },
  }
}

/** Corpses close to the wizard keep burning. */
function cinderCrownBuff(): Buff {
  return {
    id: 'art_crown_cinders', name: '余烬王冠', kind: 'equip', duration: -1, color: '#ff5219',
    desc: '3 格内击杀的敌人爆发为火焰云。',
    onKill(u, g, victim) {
      if (cheb(u.x, u.y, victim.x, victim.y) > 3) return
      g.fx.burst(victim.x, victim.y, 1, '#ff5219')
      spawnCloud(g, 'fire', victim.x, victim.y, 3, 5, 'player')
    },
  }
}

/** Each kill tops the lantern up with a short, generous damage bonus. */
function hollowLanternBuff(): Buff {
  return {
    id: 'art_hollow_lantern', name: '空心提灯', kind: 'equip', duration: -1, color: '#a05ad0',
    desc: '击杀后 3 回合内 +2 伤害。',
    onKill(u, g) {
      g.fx.flash(u.x, u.y, '#a05ad0')
      applyBuff(g, u, {
        id: 'art_soul_glut', name: '灵魂饱食', kind: 'buff', duration: 3, color: '#a05ad0',
        desc: '造成的伤害 +2。',
        modifyOutgoing(_owner, _game, ev) { if (ev.amount > 0) ev.amount += 2 },
      })
    },
  }
}

/** Retaliation must never retaliate against itself, hence the latch. */
function thundershroudBuff(): Buff {
  let retaliating = false
  return {
    id: 'art_thundershroud', name: '雷霆披风', kind: 'equip', duration: -1, color: '#ffe019',
    desc: '攻击者受到 6 点闪电伤害。',
    onHurt(u, g, ev) {
      const src = ev.source
      if (retaliating || !src || src === u || !src.alive || src.team === 'player') return
      retaliating = true
      g.fx.bolt(u.x, u.y, src.x, src.y, '#ffe019')
      dealDamage(g, src, 6, 'lightning', u)
      retaliating = false
    },
  }
}

/** Blood magic pays for itself. Reads the base cost so it fires even at 0. */
function bloodletterBuff(): Buff {
  return {
    id: 'art_bloodletter', name: '放血者握套', kind: 'equip', duration: -1, color: '#d02b3a',
    desc: '施放消耗生命的法术时回复 5 点生命。',
    onCast(u, g, s) {
      if ((s.def.hpCost ?? 0) <= 0) return
      healUnit(g, u, 5)
    },
  }
}

/** Slow, steady charge regeneration. The forge never fully cools. */
function forgeHandwrapsBuff(): Buff {
  return {
    id: 'art_forge_handwraps', name: '熔炉缠手带', kind: 'equip', duration: -1, color: '#ffd84a',
    desc: '每 5 回合，一个耗尽的法术回复 1 点充能。',
    onTurnEnd(u, g) {
      if (g.run.turn % 5 !== 0) return
      const dry = g.player.spells.filter(sp => sp.charges < sp.maxCharges)
      if (!dry.length) return
      const s = g.rng.pick(dry)
      s.charges++
      g.fx.flash(u.x, u.y, '#ffd84a')
      g.log(`${s.name} 回复 1 点充能。`, '#9ad0ff')
    },
  }
}

/** Punishes melee that trades blows with a retreating wizard. */
function gravewardBuff(): Buff {
  return {
    id: 'art_graveward', name: '墓守草履', kind: 'equip', duration: -1, color: '#a05ad0',
    desc: '离开一格时，对该格相邻的敌人造成 4 点黑暗伤害。',
    onMove(u, g, fromX, fromY) {
      const foes = unitsNear(g, fromX, fromY, 1, t => t.team === 'enemy')
      if (!foes.length) return
      g.fx.burst(fromX, fromY, 1, '#a05ad0')
      for (const t of foes) dealDamage(g, t, 4, 'dark', u)
    },
  }
}

/** A trickle of extra components from kills the wizard witnesses up close. */
function merciesBuff(): Buff {
  return {
    id: 'art_mercies', name: '小恩圣骸匣', kind: 'equip', duration: -1, color: '#fff5b0',
    desc: '6 格内击杀的敌人有 10% 概率留下材料。',
    onKill(u, g, victim) {
      if (cheb(u.x, u.y, victim.x, victim.y) > 6) return
      if (!g.rng.chance(0.1)) return
      const id = g.rng.pick(COMPONENT_LETTERS)
      g.giveComponent(id, 1)
      g.fx.flash(u.x, u.y, '#fff5b0')
      g.log(`圣骸匣收下了 ${victim.name} 的一片残骸。${COMPONENTS[id].name} +1`, '#ffd84a')
    },
  }
}

/**
 * Minions have no player-visible death hook, so the cage counts its charges
 * once per turn instead. Realm changes resync without paying out.
 */
function soulcageBuff(): Buff {
  let known = 0
  let realm = -1
  return {
    id: 'art_soulcage', name: '囚魂圣骸匣', kind: 'equip', duration: -1, color: '#c8a0f0',
    desc: '每当一个召唤物死亡，回复 5 点生命。',
    onTurnEnd(u, g) {
      const allies = g.level.units.filter(t => t.alive && t.team === 'player' && !t.isPlayer).length
      if (realm !== g.run.realmIndex) {
        realm = g.run.realmIndex
        known = allies
        return
      }
      const lost = known - allies
      known = allies
      if (lost <= 0) return
      g.fx.flash(u.x, u.y, '#c8a0f0')
      healUnit(g, u, Math.min(lost, 3) * 5)
    },
  }
}

/** Chain detonations would recurse through killUnit, so only direct kills fire. */
function orreryBuff(): Buff {
  let firing = false
  return {
    id: 'art_orrery', name: '碎星天仪', kind: 'equip', duration: -1, color: '#ff5cc8',
    desc: '每次击杀在半径 2 内引爆，造成 6 点奥术伤害。',
    onKill(u, g, victim) {
      if (firing) return
      firing = true
      g.fx.burst(victim.x, victim.y, 2, '#ff5cc8')
      for (const t of unitsNear(g, victim.x, victim.y, 2, t => t.team === 'enemy')) {
        dealDamage(g, t, 6, 'arcane', u)
      }
      firing = false
    },
  }
}

// ------------------------------------------------------------------ artifacts

export const artifacts: ArtifactDef[] = [
  // --- rings, first hand: the aggressive elements -------------------------
  {
    id: 'ember_band', name: '余烬戒', slot: 'ring1', sprite: 'art_ember_band',
    color: '#ff5219', tier: 1, cost: { C: 2 },
    desc: '火焰法术 +2 伤害。',
    bonuses: { damage: { fire: 2 } },
  },
  {
    id: 'stormwire_band', name: '风暴丝戒', slot: 'ring1', sprite: 'art_stormwire_band',
    color: '#ffe019', tier: 1, cost: { S: 2 },
    desc: '闪电法术 +2 伤害。',
    bonuses: { damage: { lightning: 2 } },
  },
  {
    id: 'sanctum_signet', name: '圣所印戒', slot: 'ring1', sprite: 'art_sanctum_signet',
    color: '#ffd84a', tier: 2, cost: { H: 3, O: 1 },
    desc: '神圣法术 +3 伤害、+1 射程。',
    bonuses: { damage: { holy: 3 }, range: { holy: 1 } },
  },
  {
    id: 'maelstrom_signet', name: '狂澜印戒', slot: 'ring1', sprite: 'art_maelstrom_signet',
    color: '#ff7a3a', tier: 2, cost: { C: 1, S: 1, U: 1, B: 1 },
    desc: '混乱法术 +3 伤害、+1 半径。',
    bonuses: { damage: { chaos: 3 }, radius: { chaos: 1 } },
  },
  {
    id: 'archon_loop', name: '执政天使环', slot: 'ring1', sprite: 'art_archon_loop',
    color: '#ff5cc8', tier: 3, cost: { O: 3, S: 2, H: 1 },
    desc: '奥术法术 +4 伤害、+1 半径。',
    bonuses: { damage: { arcane: 4 }, radius: { arcane: 1 } },
  },

  // --- rings, second hand: the patient elements ---------------------------
  {
    id: 'rime_band', name: '白霜戒', slot: 'ring2', sprite: 'art_rime_band',
    color: '#7fd8ff', tier: 1, cost: { I: 2 },
    desc: '冰霜法术 +2 伤害。',
    bonuses: { damage: { ice: 2 } },
  },
  {
    id: 'gravebound_band', name: '墓缚戒', slot: 'ring2', sprite: 'art_gravebound_band',
    color: '#a05ad0', tier: 1, cost: { U: 2 },
    desc: '黑暗法术 +2 伤害。',
    bonuses: { damage: { dark: 2 } },
  },
  {
    id: 'thornroot_ring', name: '荆根戒', slot: 'ring2', sprite: 'art_thornroot_ring',
    color: '#5ad04a', tier: 1, cost: { T: 2, B: 1 },
    desc: '自然法术 +2 伤害、+1 持续。',
    bonuses: { damage: { nature: 2 }, duration: { nature: 1 } },
  },
  {
    id: 'bloodglass_ring', name: '血玻璃戒', slot: 'ring2', sprite: 'art_bloodglass_ring',
    color: '#d02b3a', tier: 1, cost: { B: 2, U: 1 },
    desc: '血魔法术 +2 伤害，生命消耗 -1。',
    bonuses: { damage: { blood: 2 }, hp_cost: { blood: -1 } },
  },
  {
    id: 'wyrmheart_ring', name: '龙心戒', slot: 'ring2', sprite: 'art_wyrmheart_ring',
    color: '#ffb03a', tier: 3, cost: { C: 3, O: 2, B: 1 },
    desc: '巨龙法术 +4 伤害、+1 半径。',
    bonuses: { damage: { dragon: 4 }, radius: { dragon: 1 } },
  },

  // --- head ---------------------------------------------------------------
  {
    id: 'riftwool_cowl', name: '裂隙绒兜帽', slot: 'head', sprite: 'art_riftwool_cowl',
    color: '#a08050', tier: 1, cost: { T: 1, B: 1 },
    desc: '最大生命 +8。',
    maxHP: 8,
  },
  {
    id: 'gravebound_circlet', name: '墓缚头环', slot: 'head', sprite: 'art_gravebound_circlet',
    color: '#a05ad0', tier: 1, cost: { U: 2, O: 1 },
    desc: '黑暗法术 +2 射程，黑暗抗性 +25%。',
    bonuses: { range: { dark: 2 } },
    resists: { dark: 25 },
  },
  {
    id: 'seers_diadem', name: '先知宝冠', slot: 'head', sprite: 'art_seers_diadem',
    color: '#bdf0ff', tier: 2, cost: { O: 2, H: 1, S: 1 },
    desc: '眼魔法术 +2 伤害、+2 持续。',
    bonuses: { damage: { eye: 2 }, duration: { eye: 2 } },
  },
  {
    id: 'crown_of_cinders', name: '余烬王冠', slot: 'head', sprite: 'art_crown_of_cinders',
    color: '#ff5219', tier: 2, cost: { C: 3, U: 1, B: 1 },
    desc: '3 格内击杀的敌人爆发为火焰云。',
    buff: cinderCrownBuff,
  },
  {
    id: 'helm_of_the_ninth_hour', name: '第九时之盔', slot: 'head', sprite: 'art_helm_of_the_ninth_hour',
    color: '#d8dce8', tier: 3, cost: { O: 3, S: 2, C: 1 },
    desc: '咒法法术 +1 充能、+2 伤害。',
    bonuses: { charges: { sorcery: 1 }, damage: { sorcery: 2 } },
  },

  // --- robe ---------------------------------------------------------------
  {
    id: 'patchwork_mantle', name: '百衲斗篷', slot: 'robe', sprite: 'art_patchwork_mantle',
    color: '#a08050', tier: 1, cost: { O: 1, T: 1, B: 1 },
    desc: '最大生命 +6，物理抗性 +25%。',
    maxHP: 6,
    resists: { physical: 25 },
  },
  {
    id: 'rimeplate_hauberk', name: '霜甲锁子甲', slot: 'robe', sprite: 'art_rimeplate_hauberk',
    color: '#7fd8ff', tier: 2, cost: { I: 3, O: 2 },
    desc: '最大生命 +12，冰霜抗性 +50%，护盾 +1。',
    maxHP: 12,
    resists: { ice: 50 },
    shields: 1,
  },
  {
    id: 'ashcloth_vestment', name: '灰布法衣', slot: 'robe', sprite: 'art_ashcloth_vestment',
    color: '#ffb03a', tier: 2, cost: { C: 3, O: 1 },
    desc: '火焰抗性 +50%，火焰法术 +2 伤害。',
    bonuses: { damage: { fire: 2 } },
    resists: { fire: 50 },
  },
  {
    id: 'thundershroud', name: '雷霆披风', slot: 'robe', sprite: 'art_thundershroud',
    color: '#ffe019', tier: 2, cost: { S: 3, O: 2 },
    desc: '攻击者受到 6 点闪电伤害。',
    buff: thundershroudBuff,
  },
  {
    id: 'vestment_of_the_void_choir', name: '虚空圣咏法衣', slot: 'robe', sprite: 'art_vestment_of_the_void_choir',
    color: '#c8a0f0', tier: 3, cost: { U: 3, O: 2, H: 1, B: 1 },
    desc: '最大生命 +16，黑暗与奥术抗性 +50%，护盾 +1。',
    maxHP: 16,
    resists: { dark: 50, arcane: 50 },
    shields: 1,
  },

  // --- amulet -------------------------------------------------------------
  {
    id: 'sorcerers_gorget', name: '术士护颈', slot: 'amulet', sprite: 'art_sorcerers_gorget',
    color: '#d8dce8', tier: 1, cost: { O: 1, C: 1, S: 1 },
    desc: '咒法法术 +1 伤害。',
    bonuses: { damage: { sorcery: 1 } },
  },
  {
    id: 'everbind_amulet', name: '永缚项链', slot: 'amulet', sprite: 'art_everbind_amulet',
    color: '#ffd84a', tier: 1, cost: { H: 2, O: 1 },
    desc: '附魔法术 +1 持续。',
    bonuses: { duration: { enchantment: 1 } },
  },
  {
    id: 'hollow_lantern', name: '空心提灯', slot: 'amulet', sprite: 'art_hollow_lantern',
    color: '#a05ad0', tier: 2, cost: { U: 3, B: 2 },
    desc: '击杀后 3 回合内 +2 伤害。',
    buff: hollowLanternBuff,
  },
  {
    id: 'chorus_of_names', name: '万名合唱', slot: 'amulet', sprite: 'art_chorus_of_names',
    color: '#fff5b0', tier: 3, cost: { H: 3, O: 2, U: 1 },
    desc: '言灵法术 +2 伤害、+1 半径、+2 持续。',
    bonuses: { damage: { word: 2 }, radius: { word: 1 }, duration: { word: 2 } },
  },
  {
    id: 'heart_of_the_rift', name: '裂隙之心', slot: 'amulet', sprite: 'art_heart_of_the_rift',
    color: '#ff5cc8', tier: 3, cost: { O: 3, H: 2, U: 2, B: 1 },
    desc: '所有法术 +1 充能。',
    bonuses: { charges: { all: 1 } },
  },

  // --- gloves -------------------------------------------------------------
  {
    id: 'emberfang_gloves', name: '烬牙手套', slot: 'gloves', sprite: 'art_emberfang_gloves',
    color: '#ff8f5a', tier: 1, cost: { C: 2, U: 1 },
    desc: '施放火焰法术时点燃附近一名敌人。',
    buff: emberfangBuff,
  },
  {
    id: 'onyx_cog_gauntlets', name: '玛瑙齿轮护手', slot: 'gloves', sprite: 'art_onyx_cog_gauntlets',
    color: '#8f9aae', tier: 2, cost: { O: 4 },
    desc: '金属法术 +3 伤害、+1 射程。',
    bonuses: { damage: { metallic: 3 }, range: { metallic: 1 } },
  },
  {
    id: 'pale_hand_graspers', name: '苍白之手爪套', slot: 'gloves', sprite: 'art_pale_hand_graspers',
    color: '#c8a0f0', tier: 2, cost: { U: 2, O: 2 },
    desc: '位移法术 +2 射程、+1 充能。',
    bonuses: { range: { translocation: 2 }, charges: { translocation: 1 } },
  },
  {
    id: 'bloodletter_grips', name: '放血者握套', slot: 'gloves', sprite: 'art_bloodletter_grips',
    color: '#d02b3a', tier: 2, cost: { B: 3, T: 1 },
    desc: '施放消耗生命的法术时回复 5 点生命。',
    buff: bloodletterBuff,
  },
  {
    id: 'handwraps_of_the_forge', name: '熔炉缠手带', slot: 'gloves', sprite: 'art_handwraps_of_the_forge',
    color: '#ffd84a', tier: 3, cost: { O: 3, S: 2, H: 1, C: 1 },
    desc: '每 5 回合，一个耗尽的法术回复 1 点充能。',
    buff: forgeHandwrapsBuff,
  },

  // --- boots --------------------------------------------------------------
  {
    id: 'cinderstep_slippers', name: '烬步软履', slot: 'boots', sprite: 'art_cinderstep_slippers',
    color: '#ff5219', tier: 1, cost: { C: 2, O: 1 },
    desc: '火焰法术 +1 半径。',
    bonuses: { radius: { fire: 1 } },
  },
  {
    id: 'frostglass_treads', name: '霜玻璃战靴', slot: 'boots', sprite: 'art_frostglass_treads',
    color: '#7fd8ff', tier: 1, cost: { I: 2, O: 1 },
    desc: '冰霜法术 +2 射程，冰霜抗性 +50%。',
    bonuses: { range: { ice: 2 } },
    resists: { ice: 50 },
  },
  {
    id: 'graveward_sandals', name: '墓守草履', slot: 'boots', sprite: 'art_graveward_sandals',
    color: '#a05ad0', tier: 2, cost: { U: 3, T: 1 },
    desc: '离开一格时，对该格相邻的敌人造成 4 点黑暗伤害。',
    buff: gravewardBuff,
  },
  {
    id: 'treads_of_the_iron_road', name: '铁道行靴', slot: 'boots', sprite: 'art_treads_of_the_iron_road',
    color: '#d8dce8', tier: 3, cost: { O: 3, I: 2, H: 1 },
    desc: '最大生命 +10，物理抗性 +50%，附魔法术 +1 充能。',
    bonuses: { charges: { enchantment: 1 } },
    maxHP: 10,
    resists: { physical: 50 },
  },

  // --- staff --------------------------------------------------------------
  {
    id: 'ashwood_wand', name: '灰木短杖', slot: 'staff', sprite: 'art_ashwood_wand',
    color: '#ffb03a', tier: 1, cost: { C: 1, S: 1, O: 1 },
    desc: '咒法法术 +1 伤害、+1 射程。',
    bonuses: { damage: { sorcery: 1 }, range: { sorcery: 1 } },
  },
  {
    id: 'staff_of_green_hours', name: '青时法杖', slot: 'staff', sprite: 'art_staff_of_green_hours',
    color: '#5ad04a', tier: 2, cost: { T: 3, B: 1, O: 1 },
    desc: '召唤物 +8 生命、+2 伤害。',
    bonuses: {
      minion_health: { minion: 8, conjuration: 8 },
      minion_damage: { minion: 2, conjuration: 2 },
    },
  },
  {
    id: 'orbcaster_rod', name: '法球术杖', slot: 'staff', sprite: 'art_orbcaster_rod',
    color: '#bdf0ff', tier: 2, cost: { O: 2, S: 2, I: 1 },
    desc: '法球法术 +2 伤害、+2 持续。',
    bonuses: { damage: { orb: 2 }, duration: { orb: 2 } },
  },
  {
    id: 'mordreds_broken_rod', name: '莫德雷德的断杖', slot: 'staff', sprite: 'art_mordreds_broken_rod',
    color: '#c8a0f0', tier: 3, cost: { U: 2, C: 2, S: 2, O: 2 },
    desc: '所有法术 +3 伤害。',
    bonuses: { damage: { all: 3 } },
  },

  // --- relic --------------------------------------------------------------
  {
    id: 'houndtooth_fetish', name: '犬牙护符', slot: 'relic', sprite: 'art_houndtooth_fetish',
    color: '#b0ff9a', tier: 1, cost: { T: 2, B: 1 },
    desc: '召唤物 +4 生命。',
    bonuses: { minion_health: { minion: 4, conjuration: 4 } },
  },
  {
    id: 'reliquary_of_small_mercies', name: '小恩圣骸匣', slot: 'relic', sprite: 'art_reliquary_of_small_mercies',
    color: '#fff5b0', tier: 2, cost: { H: 2, O: 2, B: 1 },
    desc: '6 格内击杀的敌人有 10% 概率留下材料。',
    buff: merciesBuff,
  },
  {
    id: 'soulcage_reliquary', name: '囚魂圣骸匣', slot: 'relic', sprite: 'art_soulcage_reliquary',
    color: '#c8a0f0', tier: 2, cost: { U: 2, B: 2, H: 1 },
    desc: '每当一个召唤物死亡，回复 5 点生命。',
    buff: soulcageBuff,
  },
  {
    id: 'orrery_of_broken_stars', name: '碎星天仪', slot: 'relic', sprite: 'art_orrery_of_broken_stars',
    color: '#ff5cc8', tier: 3, cost: { O: 3, U: 2, S: 2 },
    desc: '每次击杀在半径 2 内引爆，造成 6 点奥术伤害。',
    buff: orreryBuff,
  },
]

// --------------------------------------------------------------------- sprites

/** [body, ink, accent] - every family shares this shading contract. */
type Pal = [string, string, string]

const FIRE: Pal = ['#3a1206', '#ffb03a', '#ff5219']
const ICE: Pal = ['#0e2634', '#bdf0ff', '#7fd8ff']
const STORM: Pal = ['#332c08', '#fff09a', '#ffe019']
const DARK: Pal = ['#221038', '#c8a0f0', '#a05ad0']
const HOLY: Pal = ['#33301a', '#fff5b0', '#ffd84a']
const NATURE: Pal = ['#123010', '#b0ff9a', '#5ad04a']
const ARCANE: Pal = ['#340c2c', '#ffb0e8', '#ff5cc8']
const METAL: Pal = ['#20232c', '#d8dce8', '#8f9aae']
const BLOOD: Pal = ['#360a12', '#ff9aa8', '#d02b3a']
const CHAOS: Pal = ['#2c1a10', '#ffc890', '#ff7a3a']
const CLOTH: Pal = ['#2a2018', '#d8c8a8', '#a08050']

const VOID = '#08080e'

/** Band seen face-on, with a bezel gem crowning it. */
function ring(pal: Pal, gem: Shape[]): SpriteDef {
  return {
    palette: pal, wobble: 0.35,
    shapes: [
      { t: 'circle', x: 0.5, y: 0.63, r: 0.29, fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'circle', x: 0.5, y: 0.63, r: 0.15, fill: VOID, stroke: '$1', w: 0.035 },
      { t: 'arc', x: 0.5, y: 0.63, r: 0.22, a0: 2.4, a1: 4.0, stroke: '$2', w: 0.04 },
      ...gem,
    ],
  }
}

/** Chain descending in a V to a hanging pendant. */
function amulet(pal: Pal, pendant: Shape[]): SpriteDef {
  return {
    palette: pal, wobble: 0.4,
    shapes: [
      { t: 'line', pts: [0.2, 0.12, 0.5, 0.5], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.8, 0.12, 0.5, 0.5], stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.5, y: 0.51, r: 0.045, fill: '$0', stroke: '$1', w: 0.03 },
      ...pendant,
    ],
  }
}

/** Dome with a brow band and a set browstone. */
function headgear(pal: Pal, motif: Shape[]): SpriteDef {
  return {
    palette: pal, wobble: 0.45,
    shapes: [
      { t: 'poly', pts: [0.2, 0.74, 0.23, 0.44, 0.34, 0.28, 0.5, 0.22, 0.66, 0.28, 0.77, 0.44, 0.8, 0.74], fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'line', pts: [0.17, 0.72, 0.83, 0.72], stroke: '$1', w: 0.055 },
      { t: 'circle', x: 0.5, y: 0.66, r: 0.06, fill: '$2', stroke: '$1', w: 0.03 },
      ...motif,
    ],
  }
}

/** Hung garment: shoulders, collar V, weighted hem. */
function robe(pal: Pal, motif: Shape[]): SpriteDef {
  return {
    palette: pal, wobble: 0.5,
    shapes: [
      { t: 'poly', pts: [0.5, 0.12, 0.68, 0.24, 0.8, 0.84, 0.5, 0.9, 0.2, 0.84, 0.32, 0.24], fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'poly', pts: [0.32, 0.24, 0.5, 0.36, 0.68, 0.24], stroke: '$1', w: 0.035, open: true },
      { t: 'line', pts: [0.2, 0.84, 0.34, 0.9, 0.5, 0.86, 0.66, 0.9, 0.8, 0.84], stroke: '$1', w: 0.035 },
      ...motif,
    ],
  }
}

/** Open hand with splayed fingers and a banded cuff. */
function glove(pal: Pal, motif: Shape[]): SpriteDef {
  return {
    palette: pal, wobble: 0.45,
    shapes: [
      { t: 'poly', pts: [0.28, 0.42, 0.7, 0.42, 0.76, 0.66, 0.64, 0.88, 0.36, 0.88, 0.24, 0.66], fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'line', pts: [0.34, 0.44, 0.32, 0.2], stroke: '$1', w: 0.055 },
      { t: 'line', pts: [0.47, 0.44, 0.46, 0.14], stroke: '$1', w: 0.055 },
      { t: 'line', pts: [0.6, 0.44, 0.62, 0.18], stroke: '$1', w: 0.055 },
      { t: 'line', pts: [0.73, 0.5, 0.87, 0.4], stroke: '$1', w: 0.05 },
      { t: 'line', pts: [0.3, 0.82, 0.7, 0.82], stroke: '$1', w: 0.04 },
      ...motif,
    ],
  }
}

/** Side-on boot: shaft, ankle, sole. */
function boot(pal: Pal, motif: Shape[]): SpriteDef {
  return {
    palette: pal, wobble: 0.45,
    shapes: [
      { t: 'poly', pts: [0.3, 0.14, 0.58, 0.14, 0.58, 0.6, 0.85, 0.62, 0.87, 0.84, 0.3, 0.84], fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'line', pts: [0.3, 0.24, 0.58, 0.24], stroke: '$1', w: 0.045 },
      { t: 'line', pts: [0.32, 0.79, 0.85, 0.79], stroke: '$2', w: 0.035 },
      ...motif,
    ],
  }
}

/** Long diagonal shaft, dark core under a bright edge, crowned by its head. */
function staff(pal: Pal, head: Shape[]): SpriteDef {
  return {
    palette: pal, wobble: 0.4,
    shapes: [
      { t: 'line', pts: [0.74, 0.22, 0.3, 0.92], stroke: '$0', w: 0.1 },
      { t: 'line', pts: [0.74, 0.22, 0.3, 0.92], stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.52, 0.56, 0.63, 0.62], stroke: '$1', w: 0.03 },
      ...head,
    ],
  }
}

export const sprites: Record<string, SpriteDef> = {
  // rings ------------------------------------------------------------------
  art_ember_band: ring(FIRE, [
    { t: 'blob', x: 0.5, y: 0.19, r: 0.13, lobes: 5, fill: '$2', stroke: '$1', w: 0.03 },
    { t: 'circle', x: 0.5, y: 0.19, r: 0.05, fill: '$1' },
  ]),
  art_stormwire_band: ring(STORM, [
    { t: 'line', pts: [0.36, 0.06, 0.55, 0.16, 0.42, 0.22, 0.62, 0.32], stroke: '$2', w: 0.05 },
    { t: 'circle', x: 0.49, y: 0.19, r: 0.045, fill: '$1' },
  ]),
  art_sanctum_signet: ring(HOLY, [
    { t: 'poly', pts: [0.5, 0.04, 0.58, 0.18, 0.5, 0.32, 0.42, 0.18], fill: '$2', stroke: '$1', w: 0.03 },
    { t: 'line', pts: [0.34, 0.18, 0.66, 0.18], stroke: '$1', w: 0.035 },
  ]),
  art_maelstrom_signet: ring(CHAOS, [
    { t: 'poly', pts: [0.5, 0.05, 0.65, 0.31, 0.35, 0.31], fill: '$2', stroke: '$1', w: 0.03 },
    { t: 'circle', x: 0.5, y: 0.23, r: 0.04, fill: VOID },
  ]),
  art_archon_loop: ring(ARCANE, [
    { t: 'poly', pts: [0.5, 0.04, 0.63, 0.12, 0.63, 0.27, 0.5, 0.35, 0.37, 0.27, 0.37, 0.12], fill: '$2', stroke: '$1', w: 0.03 },
    { t: 'circle', x: 0.5, y: 0.195, r: 0.05, fill: '$1' },
  ]),
  art_rime_band: ring(ICE, [
    { t: 'poly', pts: [0.5, 0.03, 0.63, 0.19, 0.5, 0.35, 0.37, 0.19], fill: '$2', stroke: '$1', w: 0.03 },
    { t: 'line', pts: [0.5, 0.07, 0.5, 0.31], stroke: '$1', w: 0.025 },
  ]),
  art_gravebound_band: ring(DARK, [
    { t: 'circle', x: 0.5, y: 0.19, r: 0.13, fill: '$2', stroke: '$1', w: 0.03 },
    { t: 'circle', x: 0.5, y: 0.19, r: 0.05, fill: VOID },
  ]),
  art_thornroot_ring: ring(NATURE, [
    { t: 'poly', pts: [0.44, 0.33, 0.38, 0.14, 0.56, 0.04, 0.63, 0.22], fill: '$2', stroke: '$1', w: 0.03 },
    { t: 'line', pts: [0.44, 0.33, 0.58, 0.12], stroke: '$1', w: 0.025 },
  ]),
  art_bloodglass_ring: ring(BLOOD, [
    { t: 'blob', x: 0.5, y: 0.2, r: 0.12, lobes: 3, fill: '$2', stroke: '$1', w: 0.03 },
    { t: 'circle', x: 0.53, y: 0.16, r: 0.035, fill: '$1' },
  ]),
  art_wyrmheart_ring: ring(FIRE, [
    { t: 'poly', pts: [0.5, 0.31, 0.28, 0.08, 0.42, 0.25], fill: '$2', stroke: '$1', w: 0.028 },
    { t: 'poly', pts: [0.5, 0.31, 0.72, 0.08, 0.58, 0.25], fill: '$2', stroke: '$1', w: 0.028 },
    { t: 'circle', x: 0.5, y: 0.26, r: 0.04, fill: '$1' },
  ]),

  // head -------------------------------------------------------------------
  art_riftwool_cowl: headgear(CLOTH, [
    { t: 'arc', x: 0.5, y: 0.52, r: 0.24, a0: 3.3, a1: 6.1, stroke: '$2', w: 0.04 },
    { t: 'poly', pts: [0.2, 0.72, 0.13, 0.88, 0.31, 0.82], fill: '$0', stroke: '$1', w: 0.035 },
    { t: 'poly', pts: [0.8, 0.72, 0.87, 0.88, 0.69, 0.82], fill: '$0', stroke: '$1', w: 0.035 },
  ]),
  art_gravebound_circlet: headgear(DARK, [
    { t: 'poly', pts: [0.24, 0.46, 0.12, 0.2, 0.33, 0.34], fill: '$2', stroke: '$1', w: 0.028 },
    { t: 'poly', pts: [0.76, 0.46, 0.88, 0.2, 0.67, 0.34], fill: '$2', stroke: '$1', w: 0.028 },
  ]),
  art_seers_diadem: headgear(ICE, [
    { t: 'ellipse', x: 0.5, y: 0.48, rx: 0.12, ry: 0.07, fill: VOID, stroke: '$1', w: 0.03 },
    { t: 'circle', x: 0.5, y: 0.48, r: 0.035, fill: '$2' },
  ]),
  art_crown_of_cinders: headgear(FIRE, [
    { t: 'line', pts: [0.28, 0.46, 0.36, 0.24, 0.43, 0.42, 0.5, 0.16, 0.57, 0.42, 0.64, 0.24, 0.72, 0.46], stroke: '$2', w: 0.045 },
    { t: 'circle', x: 0.5, y: 0.34, r: 0.04, fill: '$1' },
  ]),
  art_helm_of_the_ninth_hour: headgear(METAL, [
    { t: 'poly', pts: [0.5, 0.12, 0.57, 0.3, 0.43, 0.3], fill: '$2', stroke: '$1', w: 0.025 },
    { t: 'line', pts: [0.5, 0.3, 0.5, 0.5], stroke: '$2', w: 0.03 },
    { t: 'line', pts: [0.3, 0.56, 0.7, 0.56], stroke: VOID, w: 0.06 },
  ]),

  // robe -------------------------------------------------------------------
  art_patchwork_mantle: robe(CLOTH, [
    { t: 'poly', pts: [0.36, 0.48, 0.47, 0.48, 0.47, 0.62, 0.36, 0.62], stroke: '$2', w: 0.03 },
    { t: 'poly', pts: [0.56, 0.62, 0.68, 0.62, 0.68, 0.76, 0.56, 0.76], stroke: '$2', w: 0.03 },
    { t: 'circle', x: 0.5, y: 0.4, r: 0.04, fill: '$2', stroke: '$1', w: 0.02 },
  ]),
  art_rimeplate_hauberk: robe(ICE, [
    { t: 'line', pts: [0.29, 0.5, 0.71, 0.5], stroke: '$2', w: 0.04 },
    { t: 'line', pts: [0.26, 0.66, 0.75, 0.66], stroke: '$2', w: 0.04 },
    { t: 'circle', x: 0.5, y: 0.42, r: 0.05, fill: '$2', stroke: '$1', w: 0.02 },
  ]),
  art_ashcloth_vestment: robe(FIRE, [
    { t: 'circle', x: 0.4, y: 0.5, r: 0.032, fill: '$2' },
    { t: 'circle', x: 0.61, y: 0.6, r: 0.032, fill: '$2' },
    { t: 'circle', x: 0.47, y: 0.72, r: 0.032, fill: '$2' },
    { t: 'circle', x: 0.5, y: 0.4, r: 0.04, fill: '$1' },
  ]),
  art_thundershroud: robe(STORM, [
    { t: 'line', pts: [0.42, 0.42, 0.57, 0.56, 0.44, 0.62, 0.6, 0.8], stroke: '$2', w: 0.045 },
    { t: 'circle', x: 0.5, y: 0.4, r: 0.045, fill: '$2', stroke: '$1', w: 0.02 },
  ]),
  art_vestment_of_the_void_choir: robe(DARK, [
    { t: 'circle', x: 0.5, y: 0.58, r: 0.12, fill: VOID, stroke: '$2', w: 0.035 },
    { t: 'arc', x: 0.5, y: 0.58, r: 0.18, a0: 3.4, a1: 6.0, stroke: '$1', w: 0.03 },
    { t: 'circle', x: 0.5, y: 0.58, r: 0.04, fill: '$1' },
  ]),

  // amulet -----------------------------------------------------------------
  art_sorcerers_gorget: amulet(METAL, [
    { t: 'poly', pts: [0.5, 0.55, 0.68, 0.62, 0.62, 0.82, 0.5, 0.9, 0.38, 0.82, 0.32, 0.62], fill: '$0', stroke: '$1', w: 0.045 },
    { t: 'circle', x: 0.5, y: 0.71, r: 0.06, fill: '$2', stroke: '$1', w: 0.025 },
    { t: 'line', pts: [0.5, 0.62, 0.5, 0.8], stroke: '$1', w: 0.02 },
  ]),
  art_everbind_amulet: amulet(HOLY, [
    { t: 'circle', x: 0.5, y: 0.72, r: 0.16, fill: '$0', stroke: '$1', w: 0.045 },
    { t: 'arc', x: 0.5, y: 0.72, r: 0.09, a0: 0, a1: 6.2, stroke: '$2', w: 0.035 },
    { t: 'circle', x: 0.5, y: 0.72, r: 0.035, fill: '$1' },
  ]),
  art_hollow_lantern: amulet(DARK, [
    { t: 'poly', pts: [0.38, 0.56, 0.62, 0.56, 0.67, 0.87, 0.33, 0.87], fill: '$0', stroke: '$1', w: 0.045 },
    { t: 'line', pts: [0.36, 0.63, 0.64, 0.63], stroke: '$1', w: 0.03 },
    { t: 'blob', x: 0.5, y: 0.74, r: 0.08, lobes: 4, fill: '$2', stroke: '$1', w: 0.02 },
  ]),
  art_chorus_of_names: amulet(HOLY, [
    { t: 'poly', pts: [0.31, 0.58, 0.69, 0.58, 0.69, 0.86, 0.31, 0.86], fill: '$0', stroke: '$1', w: 0.045 },
    { t: 'circle', x: 0.41, y: 0.72, r: 0.04, fill: '$2' },
    { t: 'circle', x: 0.5, y: 0.72, r: 0.04, fill: '$2' },
    { t: 'circle', x: 0.59, y: 0.72, r: 0.04, fill: '$2' },
  ]),
  art_heart_of_the_rift: amulet(ARCANE, [
    { t: 'blob', x: 0.5, y: 0.72, r: 0.17, lobes: 4, fill: '$0', stroke: '$1', w: 0.05 },
    { t: 'blob', x: 0.5, y: 0.72, r: 0.09, lobes: 5, fill: '$2', stroke: '$1', w: 0.025 },
    { t: 'circle', x: 0.5, y: 0.72, r: 0.035, fill: '#ffffff' },
  ]),

  // gloves -----------------------------------------------------------------
  art_emberfang_gloves: glove(FIRE, [
    { t: 'blob', x: 0.5, y: 0.64, r: 0.09, lobes: 5, fill: '$2', stroke: '$1', w: 0.025 },
  ]),
  art_onyx_cog_gauntlets: glove(METAL, [
    { t: 'circle', x: 0.5, y: 0.64, r: 0.11, fill: '$2', stroke: '$1', w: 0.03 },
    { t: 'circle', x: 0.5, y: 0.64, r: 0.045, fill: VOID },
  ]),
  art_pale_hand_graspers: glove(DARK, [
    { t: 'poly', pts: [0.5, 0.53, 0.61, 0.65, 0.5, 0.77, 0.39, 0.65], stroke: '$2', w: 0.03 },
    { t: 'circle', x: 0.5, y: 0.65, r: 0.035, fill: '$2' },
  ]),
  art_bloodletter_grips: glove(BLOOD, [
    { t: 'blob', x: 0.5, y: 0.67, r: 0.09, lobes: 3, fill: '$2', stroke: '$1', w: 0.025 },
    { t: 'line', pts: [0.4, 0.54, 0.6, 0.54], stroke: '$2', w: 0.03 },
  ]),
  art_handwraps_of_the_forge: glove(HOLY, [
    { t: 'line', pts: [0.26, 0.56, 0.74, 0.6], stroke: '$2', w: 0.035 },
    { t: 'line', pts: [0.28, 0.7, 0.72, 0.74], stroke: '$2', w: 0.035 },
  ]),

  // boots ------------------------------------------------------------------
  art_cinderstep_slippers: boot(FIRE, [
    { t: 'blob', x: 0.4, y: 0.66, r: 0.09, lobes: 5, fill: '$2', stroke: '$1', w: 0.025 },
    { t: 'circle', x: 0.4, y: 0.66, r: 0.035, fill: '$1' },
  ]),
  art_frostglass_treads: boot(ICE, [
    { t: 'poly', pts: [0.68, 0.62, 0.75, 0.74, 0.61, 0.74], fill: '$2', stroke: '$1', w: 0.02 },
    { t: 'poly', pts: [0.44, 0.34, 0.53, 0.48, 0.35, 0.48], fill: '$2', stroke: '$1', w: 0.02 },
  ]),
  art_graveward_sandals: boot(DARK, [
    { t: 'circle', x: 0.44, y: 0.42, r: 0.05, fill: '$2', stroke: '$1', w: 0.02 },
    { t: 'arc', x: 0.44, y: 0.42, r: 0.1, a0: 3.3, a1: 6.1, stroke: '$1', w: 0.03 },
  ]),
  art_treads_of_the_iron_road: boot(METAL, [
    { t: 'line', pts: [0.32, 0.36, 0.57, 0.36], stroke: '$2', w: 0.035 },
    { t: 'circle', x: 0.45, y: 0.71, r: 0.035, fill: '$2' },
    { t: 'circle', x: 0.64, y: 0.71, r: 0.035, fill: '$2' },
  ]),

  // staff ------------------------------------------------------------------
  art_ashwood_wand: staff(FIRE, [
    { t: 'circle', x: 0.77, y: 0.15, r: 0.09, fill: '$2', stroke: '$1', w: 0.03 },
    { t: 'circle', x: 0.77, y: 0.15, r: 0.035, fill: '$1' },
    { t: 'line', pts: [0.66, 0.26, 0.86, 0.26], stroke: '$1', w: 0.025 },
  ]),
  art_staff_of_green_hours: staff(NATURE, [
    { t: 'poly', pts: [0.76, 0.18, 0.6, 0.06, 0.69, 0.26], fill: '$2', stroke: '$1', w: 0.025 },
    { t: 'poly', pts: [0.76, 0.18, 0.93, 0.08, 0.85, 0.28], fill: '$2', stroke: '$1', w: 0.025 },
    { t: 'circle', x: 0.76, y: 0.19, r: 0.04, fill: '$1' },
  ]),
  art_orbcaster_rod: staff(ICE, [
    { t: 'circle', x: 0.76, y: 0.17, r: 0.13, fill: '$0', stroke: '$1', w: 0.035 },
    { t: 'arc', x: 0.76, y: 0.17, r: 0.13, a0: 0.4, a1: 3.6, stroke: '$2', w: 0.04 },
    { t: 'circle', x: 0.76, y: 0.17, r: 0.05, fill: '$2' },
  ]),
  art_mordreds_broken_rod: staff(DARK, [
    { t: 'poly', pts: [0.71, 0.32, 0.79, 0.05, 0.88, 0.26], fill: '$2', stroke: '$1', w: 0.028 },
    { t: 'poly', pts: [0.86, 0.31, 0.96, 0.13, 0.98, 0.32], fill: '$0', stroke: '$2', w: 0.028 },
    { t: 'circle', x: 0.79, y: 0.26, r: 0.05, fill: '$1' },
    { t: 'line', pts: [0.55, 0.5, 0.66, 0.44], stroke: '$2', w: 0.03 },
  ]),

  // relic ------------------------------------------------------------------
  art_houndtooth_fetish: {
    palette: NATURE, wobble: 0.5,
    shapes: [
      { t: 'line', pts: [0.13, 0.27, 0.5, 0.22, 0.87, 0.2], stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.22, y: 0.26, r: 0.04, fill: '$2', stroke: '$1', w: 0.02 },
      { t: 'circle', x: 0.78, y: 0.21, r: 0.04, fill: '$2', stroke: '$1', w: 0.02 },
      { t: 'poly', pts: [0.36, 0.32, 0.64, 0.32, 0.58, 0.62, 0.5, 0.92, 0.42, 0.62], fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'circle', x: 0.5, y: 0.4, r: 0.045, fill: '#08080e', stroke: '$1', w: 0.025 },
      { t: 'line', pts: [0.5, 0.52, 0.5, 0.84], stroke: '$2', w: 0.03 },
    ],
  },
  art_reliquary_of_small_mercies: {
    palette: HOLY, wobble: 0.45,
    shapes: [
      { t: 'poly', pts: [0.26, 0.44, 0.74, 0.44, 0.78, 0.84, 0.22, 0.84], fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'poly', pts: [0.24, 0.45, 0.5, 0.24, 0.76, 0.45], fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.23, 0.62, 0.77, 0.62], stroke: '$1', w: 0.03 },
      { t: 'circle', x: 0.5, y: 0.62, r: 0.055, fill: '$2', stroke: '$1', w: 0.025 },
      { t: 'circle', x: 0.5, y: 0.36, r: 0.035, fill: '$2' },
    ],
  },
  art_soulcage_reliquary: {
    palette: DARK, wobble: 0.45,
    shapes: [
      { t: 'ellipse', x: 0.5, y: 0.6, rx: 0.24, ry: 0.28, fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'line', pts: [0.37, 0.36, 0.35, 0.84], stroke: '$1', w: 0.03 },
      { t: 'line', pts: [0.5, 0.33, 0.5, 0.87], stroke: '$1', w: 0.03 },
      { t: 'line', pts: [0.63, 0.36, 0.65, 0.84], stroke: '$1', w: 0.03 },
      { t: 'blob', x: 0.5, y: 0.6, r: 0.1, lobes: 5, fill: '$2', stroke: '$1', w: 0.025 },
      { t: 'circle', x: 0.46, y: 0.57, r: 0.022, fill: VOID },
      { t: 'circle', x: 0.55, y: 0.57, r: 0.022, fill: VOID },
    ],
  },
  art_orrery_of_broken_stars: {
    palette: ARCANE, wobble: 0.4,
    shapes: [
      { t: 'circle', x: 0.5, y: 0.55, r: 0.3, stroke: '$1', w: 0.04 },
      { t: 'ellipse', x: 0.5, y: 0.55, rx: 0.3, ry: 0.12, rot: 0.5, stroke: '$2', w: 0.035 },
      { t: 'ellipse', x: 0.5, y: 0.55, rx: 0.12, ry: 0.3, rot: -0.4, stroke: '$2', w: 0.035 },
      { t: 'circle', x: 0.5, y: 0.55, r: 0.1, fill: '$0', stroke: '$1', w: 0.03 },
      { t: 'circle', x: 0.5, y: 0.55, r: 0.045, fill: '$1' },
      { t: 'circle', x: 0.78, y: 0.28, r: 0.035, fill: '$2' },
    ],
  },
}
