import { describe, expect, it } from 'vitest'
import { getArtifacts, getConsumables, getSpellDefs, getSprites, getUnitDefs, getUnitDef } from '../src/core/registry'
import { BOSS_REALMS } from '../src/core/realm'
import { validTarget, SpellInst } from '../src/core/spell'
import { BUFFS, makeBuff } from '../src/core/buffs'
import { CLOUDS } from '../src/core/clouds'
import { Game } from '../src/core/game'

describe('content registry', () => {
  it('loads a full content set', () => {
    expect(getSpellDefs().length).toBeGreaterThanOrEqual(60)
    expect(getUnitDefs().length).toBeGreaterThanOrEqual(45)
    expect(getArtifacts().length).toBeGreaterThanOrEqual(30)
    expect(getConsumables().length).toBeGreaterThanOrEqual(10)
  })

  it('has art for every referenced sprite key', () => {
    const sprites = getSprites()
    const missing: string[] = []
    for (const s of getSpellDefs()) if (!sprites[s.icon]) missing.push(`spell ${s.id} -> ${s.icon}`)
    for (const u of getUnitDefs()) if (!sprites[u.sprite]) missing.push(`unit ${u.id} -> ${u.sprite}`)
    for (const a of getArtifacts()) if (!sprites[a.sprite]) missing.push(`artifact ${a.id} -> ${a.sprite}`)
    for (const c of getConsumables()) if (!sprites[c.sprite]) missing.push(`consumable ${c.id} -> ${c.sprite}`)
    for (const key of ['portal', 'shrine', 'cloud_fire', 'cloud_poison', 'cloud_ice', 'cloud_storm',
      'cloud_void', 'cloud_dark', 'cloud_holy', 'cloud_ash',
      'comp_umbral', 'comp_thorn', 'comp_cinder', 'comp_halo', 'comp_blood', 'comp_rime', 'comp_spark', 'comp_onyx']) {
      if (!sprites[key]) missing.push(`shared ${key}`)
    }
    expect(missing).toEqual([])
  })

  it('spells obey the shop contract', () => {
    const bad: string[] = []
    for (const s of getSpellDefs()) {
      if (s.level < 1 || s.level > 8) bad.push(`${s.id} level ${s.level}`)
      if (s.charges < 0) bad.push(`${s.id} charges ${s.charges}`)
      if (s.upgrades.length < 4) bad.push(`${s.id} has ${s.upgrades.length} upgrades`)
      const ids = new Set(s.upgrades.map(u => u.id))
      if (ids.size !== s.upgrades.length) bad.push(`${s.id} duplicate upgrade ids`)
      const style = s.tags.filter(t => t === 'sorcery' || t === 'enchantment' || t === 'conjuration')
      if (style.length === 0) bad.push(`${s.id} has no casting-style tag`)
    }
    expect(bad).toEqual([])
  })

  it('monsters stay inside their level bands', () => {
    const band: Record<number, [number, number]> = {
      1: [4, 16], 2: [12, 28], 3: [20, 46], 4: [34, 80], 5: [60, 125],
      6: [95, 180], 7: [140, 260], 8: [200, 380], 9: [350, 1200],
    }
    const bad: string[] = []
    for (const u of getUnitDefs()) {
      if (u.id === 'wizard') continue
      // summonables are balanced against their spell, not the spawn table
      const summonOnly = u.team === 'player' || u.weight === 0 || (u.minRealm ?? 1) > 20
      const range = band[u.level]
      if (!range) { bad.push(`${u.id} level ${u.level}`); continue }
      if (!summonOnly && (u.maxHP < range[0] || u.maxHP > range[1])) {
        bad.push(`${u.id} hp ${u.maxHP} outside ${range}`)
      }
      let longRanged = 0
      for (const a of u.attacks ?? []) {
        if (a.summonId && !getUnitDef(a.summonId)) bad.push(`${u.id} summons unknown ${a.summonId}`)
        if ((a.range ?? 1) > 6) longRanged++
      }
      // the guide allows at most one long-range attack outside boss fights
      if (!u.tags?.includes('boss') && longRanged > 1) bad.push(`${u.id} has ${longRanged} long-range attacks`)
      if (u.deathSpawn && !getUnitDef(u.deathSpawn.id)) bad.push(`${u.id} deathSpawn unknown ${u.deathSpawn.id}`)
    }
    expect(bad).toEqual([])
  })
  it('has every boss the realm table asks for', () => {
    for (const id of Object.values(BOSS_REALMS)) {
      const def = getUnitDef(id)
      expect(def, `missing boss ${id}`).toBeTruthy()
      expect(def?.tags).toContain('boss')
    }
  })

  it('every buff id referenced by content resolves', () => {
    const missing: string[] = []
    for (const u of getUnitDefs()) {
      for (const id of u.passives ?? []) {
        if (!makeBuff(id, 3)) missing.push(`unit ${u.id} passive ${id}`)
      }
      for (const a of u.attacks ?? []) {
        if (a.buff && !makeBuff(a.buff, a.buffDuration ?? 3, a.buffPower)) {
          missing.push(`unit ${u.id} attack ${a.name ?? a.kind} buff ${a.buff}`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('keeps the documented buff contract', () => {
    // docs/content-guide.md publishes these ids to content authors; removing
    // one silently turns makeBuff into a no-op, so pin the whole set.
    const documented = [
      'stunned', 'frozen', 'petrified', 'glassified', 'poisoned', 'burning', 'bleeding',
      'berserk', 'blind', 'rooted', 'regen', 'shielded', 'hasted', 'swift', 'ironskin',
      'holy_armor', 'frost_ward', 'arcane_ward', 'conductance', 'melted', 'cursed',
      'soul_marked', 'doomed', 'flame_aura', 'storm_aura', 'frost_aura', 'toxic_aura',
      'enchanted', 'vigor', 'channeling',
    ]
    expect(documented.filter(id => !BUFFS[id])).toEqual([])
  })

  it('every cloud kind referenced by content resolves', () => {
    const missing: string[] = []
    for (const u of getUnitDefs()) {
      for (const a of u.attacks ?? []) {
        if (a.cloudKind && !CLOUDS[a.cloudKind]) missing.push(`unit ${u.id} cloud ${a.cloudKind}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('ships the two mandatory consumables', () => {
    const ids = getConsumables().map(c => c.id)
    expect(ids).toContain('mana_potion')
    expect(ids).toContain('healing_potion')
  })

  it('spell descriptions render without throwing', () => {
    const g = new Game('desc-test')
    g.newRun('desc-test')
    for (const def of getSpellDefs()) {
      const inst = new SpellInst(def, g.player)
      expect(typeof inst.describe(), `${def.id} description`).toBe('string')
      // and with both upgrades applied
      inst.upgradesTaken = def.upgrades.slice(0, 2).map(u => u.id)
      expect(typeof inst.describe(), `${def.id} upgraded description`).toBe('string')
    }
  })
})

describe('every spell casts without crashing', () => {
  it('casts each spell at a live target', () => {
    const failures: string[] = []

    for (const def of getSpellDefs()) {
      const g = new Game(`cast-${def.id}`)
      g.newRun(`cast-${def.id}`)
      const inst = new SpellInst(def, g.player)
      inst.upgradesTaken = def.upgrades.slice(0, 2).map(u => u.id)
      g.player.spells = [inst]
      g.player.hp = g.player.maxHP = 500

      // find any legal target; fall back to the wizard's own tile
      let target = { x: g.player.x, y: g.player.y }
      let found = false
      for (const u of g.level.units) {
        if (validTarget(inst, g, u.x, u.y)) { target = { x: u.x, y: u.y }; found = true; break }
      }
      if (!found) {
        for (let y = 0; y < g.level.h && !found; y++) {
          for (let x = 0; x < g.level.w && !found; x++) {
            if (validTarget(inst, g, x, y)) { target = { x, y }; found = true }
          }
        }
      }
      if (!found) continue // nothing legal on this map, not a defect

      try {
        g.castSpell(0, target.x, target.y)
        // channelled spells get a second tick
        if (def.channel) g.continueChannel()
      } catch (err) {
        failures.push(`${def.id}: ${(err as Error).message}`)
      }
    }
    expect(failures).toEqual([])
  })
})
