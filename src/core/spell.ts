import type { DamageType, Point, Tag, TargetKind } from './types'
import type { Game } from './game'
import type { Unit } from './unit'

/**
 * Free-form numeric stat block. Well-known keys:
 *  damage, range, radius, duration, num_targets, num_summons, minion_health,
 *  minion_damage, minion_range, minion_duration, charges, hp_cost, shields,
 *  strikechance, bonus_hp, cascade_range, chain
 */
export type SpellStats = Record<string, number>

export interface UpgradeDef {
  id: string
  name: string
  desc: string
  /** skill point cost; defaults to the spell's level */
  cost?: number
  /** numeric stat deltas */
  mods?: SpellStats
  /** behaviour switch the cast function checks with `s.has(flag)` */
  flag?: string
}

export interface SpellDef {
  id: string
  name: string
  /** skill point cost to learn */
  level: number
  /** base charges per realm */
  charges: number
  tags: Tag[]
  /** sprite key for the icon */
  icon: string
  color?: string
  target: TargetKind
  /** default true for ranged spells */
  requiresLOS?: boolean
  /** HP paid on cast (blood spells) */
  hpCost?: number
  /** main damage school; inferred from tags when omitted */
  damageType?: DamageType
  /** channels for N turns: the effect repeats while the wizard holds still */
  channel?: number
  stats: SpellStats
  /** four or more upgrade options; the wizard may take two */
  upgrades: UpgradeDef[]
  desc: (s: SpellInst) => string
  cast: (s: SpellInst, g: Game, x: number, y: number) => void
  /** extra targeting restriction */
  canTarget?: (s: SpellInst, g: Game, x: number, y: number) => boolean
  /** tiles highlighted while aiming */
  aoe?: (s: SpellInst, g: Game, x: number, y: number) => Point[]
  /** description of what the spell hits, shown in the tooltip footer */
  flavor?: string
}

export class SpellInst {
  readonly def: SpellDef
  charges: number
  /** chosen upgrade ids, max 2 */
  upgradesTaken: string[] = []
  owner: Unit
  /** set while this spell is being channeled */
  channelTurns = 0
  channelTarget?: Point

  constructor(def: SpellDef, owner: Unit) {
    this.def = def
    this.owner = owner
    this.charges = this.maxCharges
  }

  get id(): string { return this.def.id }
  get name(): string { return this.def.name }
  get tags(): Tag[] { return this.def.tags }

  has(flag: string): boolean {
    for (const id of this.upgradesTaken) {
      const up = this.def.upgrades.find(u => u.id === id)
      if (up?.flag === flag) return true
    }
    return false
  }

  hasUpgrade(id: string): boolean { return this.upgradesTaken.includes(id) }

  /** Resolved stat: base + upgrades + the wizard's tag bonuses. */
  st(name: string): number {
    let v = this.def.stats[name] ?? 0
    for (const id of this.upgradesTaken) {
      const up = this.def.upgrades.find(u => u.id === id)
      const m = up?.mods?.[name]
      if (m !== undefined) v += m
    }
    v += this.owner.bonusFor(name, this.def.tags, this.def.id)
    return Math.floor(v)
  }

  get maxCharges(): number {
    const base = this.def.charges + (this.def.stats.charges ?? 0)
    return Math.max(1, base + this.owner.bonusFor('charges', this.def.tags, this.def.id))
  }

  get hpCost(): number {
    return Math.max(0, (this.def.hpCost ?? 0) + this.owner.bonusFor('hp_cost', this.def.tags, this.def.id))
  }

  get range(): number { return this.st('range') }
  get radius(): number { return this.st('radius') }
  get damage(): number { return this.st('damage') }
  get duration(): number { return this.st('duration') }

  get requiresLOS(): boolean {
    if (this.has('sightless')) return false
    return this.def.requiresLOS ?? true
  }

  /** Remaining upgrade picks (the series allows two per spell). */
  get upgradePicksLeft(): number { return Math.max(0, 2 - this.upgradesTaken.length) }

  describe(): string { return this.def.desc(this) }
}

/** Targeting predicate shared by the engine and the aiming overlay. */
export function validTarget(s: SpellInst, g: Game, x: number, y: number): boolean {
  const lvl = g.level
  if (!lvl.inBounds(x, y)) return false
  const kind: TargetKind = s.def.target
  if (kind === 'self') return x === g.player.x && y === g.player.y

  const r = s.range
  if (r > 0 && Math.hypot(x - g.player.x, y - g.player.y) > r + 0.001) return false
  if (s.requiresLOS && !lvl.hasLOS(g.player.x, g.player.y, x, y)) return false

  const u = lvl.unitAt(x, y)
  switch (kind) {
    case 'unit': if (!u) return false; break
    case 'enemy': if (!u || u.team === 'player') return false; break
    case 'ally': if (!u || u.team !== 'player') return false; break
    case 'empty': if (u || !lvl.passable(x, y, true)) return false; break
    case 'wall': if (lvl.get(x, y) !== 1) return false; break
    case 'tile': break
  }
  if (s.def.canTarget && !s.def.canTarget(s, g, x, y)) return false
  return true
}

const TAG_DAMAGE: readonly [Tag, DamageType][] = [
  ['fire', 'fire'], ['ice', 'ice'], ['lightning', 'lightning'], ['dark', 'dark'],
  ['holy', 'holy'], ['arcane', 'arcane'], ['nature', 'poison'], ['blood', 'dark'],
  ['chaos', 'fire'], ['metallic', 'physical'],
]

/**
 * The damage school a spell mostly deals: used by tooltips and by anything
 * reasoning about resistances. Content may declare `damageType` explicitly,
 * otherwise it is inferred from the elemental tag.
 */
export function primaryDamageType(def: SpellDef): DamageType | undefined {
  if (def.damageType) return def.damageType
  if (!def.stats.damage) return undefined
  for (const [tag, type] of TAG_DAMAGE) if (def.tags.includes(tag)) return type
  return 'physical'
}
