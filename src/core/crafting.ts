import type { Bonuses, ComponentId, DamageType, EquipSlot } from './types'
import { COMPONENT_IDS } from './types'
import type { Buff } from './unit'
import type { Game } from './game'
import { applyBuff, removeBuff } from './combat'
import { getArtifacts } from './registry'

/**
 * Crafted artifact — Rift Wizard 3 replaces passive skills with fused
 * components, so this is where all permanent power lives.
 */
export interface ArtifactDef {
  id: string
  name: string
  slot: EquipSlot
  sprite: string
  color?: string
  /** 1 = early, 2 = mid, 3 = late */
  tier: number
  desc: string
  /** component recipe */
  cost: Partial<Record<ComponentId, number>>
  /** spell bonuses granted while worn */
  bonuses?: Bonuses
  resists?: Partial<Record<DamageType, number>>
  maxHP?: number
  shields?: number
  /** extra behaviour: a permanent equip-kind buff with hooks */
  buff?: () => Buff
}

export type ComponentPouch = Record<ComponentId, number>

export function emptyPouch(): ComponentPouch {
  return { U: 0, T: 0, C: 0, H: 0, B: 0, I: 0, S: 0, O: 0 }
}

export function pouchTotal(p: ComponentPouch): number {
  let n = 0
  for (const id of COMPONENT_IDS) n += p[id]
  return n
}

export function canCraft(pouch: ComponentPouch, def: ArtifactDef): boolean {
  for (const id of COMPONENT_IDS) {
    const need = def.cost[id] ?? 0
    if (need > pouch[id]) return false
  }
  return true
}

export function recipeText(def: ArtifactDef): string {
  return COMPONENT_IDS.filter(id => def.cost[id]).map(id => `${id}:${def.cost[id]}`).join(' ')
}

/** Build the equip buff for an artifact (resists, hp, custom hooks). */
function equipBuff(def: ArtifactDef): Buff {
  const custom = def.buff?.()
  const buff: Buff = custom ?? { id: `eq_${def.id}`, name: def.name, kind: 'equip', duration: -1 }
  buff.id = `eq_${def.id}`
  buff.kind = 'equip'
  buff.duration = -1
  buff.name = def.name
  if (def.resists) buff.resists = { ...(buff.resists ?? {}), ...def.resists }
  if (def.maxHP) buff.maxHPBonus = (buff.maxHPBonus ?? 0) + def.maxHP
  return buff
}

/** Merge every worn artifact's bonuses into the wizard's bonus table. */
export function recomputeBonuses(g: Game): void {
  const total: Bonuses = {}
  for (const def of Object.values(g.run.equipment)) {
    if (!def?.bonuses) continue
    for (const [stat, scopes] of Object.entries(def.bonuses)) {
      const dst = total[stat] ?? (total[stat] = {})
      for (const [scope, amount] of Object.entries(scopes ?? {})) {
        dst[scope as keyof typeof dst] = (dst[scope as keyof typeof dst] ?? 0) + (amount ?? 0)
      }
    }
  }
  g.player.bonuses = total
  // charge bonuses can raise max charges: top up any spell that is at max
  for (const s of g.player.spells) if (s.charges > s.maxCharges) s.charges = s.maxCharges
}

/** Wear an artifact, replacing whatever occupies its slot. */
export function equipArtifact(g: Game, def: ArtifactDef): void {
  const prev = g.run.equipment[def.slot]
  if (prev) {
    removeBuff(g, g.player, `eq_${prev.id}`)
    if (prev.shields) g.player.shields = Math.max(0, g.player.shields - prev.shields)
  }
  g.run.equipment[def.slot] = def
  applyBuff(g, g.player, equipBuff(def))
  if (def.shields) g.player.shields += def.shields
  recomputeBonuses(g)
}

export function craftArtifact(g: Game, def: ArtifactDef): boolean {
  if (!canCraft(g.run.components, def)) return false
  for (const id of COMPONENT_IDS) {
    const need = def.cost[id] ?? 0
    if (need) g.run.components[id] -= need
  }
  equipArtifact(g, def)
  g.log(`熔铸出 ${def.name}。`, '#ffd84a')
  return true
}

/** Artifacts the wizard can afford right now. */
export function craftableArtifacts(g: Game): ArtifactDef[] {
  return getArtifacts().filter(a => canCraft(g.run.components, a))
}
