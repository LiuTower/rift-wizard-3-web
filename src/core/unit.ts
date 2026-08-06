import { DAMAGE_TYPES, type Bonuses, type BonusScope, type CreatureTag, type DamageType, type Tag, type Team } from './types'
import type { Game } from './game'
import type { SpellInst } from './spell'
import type { DamageEvent } from './combat'

/**
 * Status effects, auras and equipment all use this one interface.
 * `duration` counts down at the end of the owner's turn; -1 means permanent
 * (equipment, run-long enchantments).
 */
export interface Buff {
  id: string
  name: string
  color?: string
  sprite?: string
  duration: number
  stacks?: number
  kind: 'buff' | 'debuff' | 'equip'
  /** resistance deltas while active */
  resists?: Partial<Record<DamageType, number>>
  /** spell bonuses granted while active (wizard only) */
  bonuses?: Bonuses
  maxHPBonus?: number
  /** control flags */
  stun?: boolean
  blind?: boolean
  berserk?: boolean
  rooted?: boolean
  /** hide from the status list (internal bookkeeping buffs) */
  hidden?: boolean
  /** stacking behaviour when re-applied: refresh duration (default) or add stacks */
  stacking?: 'refresh' | 'stack' | 'ignore'
  desc?: string

  onApply?(u: Unit, g: Game): void
  onExpire?(u: Unit, g: Game): void
  onTurnStart?(u: Unit, g: Game): void
  onTurnEnd?(u: Unit, g: Game): void
  /** mutate incoming damage (resistances already applied to ev.amount) */
  modifyIncoming?(u: Unit, g: Game, ev: DamageEvent): void
  /** mutate damage this unit is about to deal */
  modifyOutgoing?(u: Unit, g: Game, ev: DamageEvent): void
  /** after damage landed on this unit */
  onHurt?(u: Unit, g: Game, ev: DamageEvent): void
  onKill?(u: Unit, g: Game, victim: Unit): void
  onDeath?(u: Unit, g: Game): void
  onCast?(u: Unit, g: Game, s: SpellInst, x: number, y: number): void
  onMove?(u: Unit, g: Game, fromX: number, fromY: number): void
}

/**
 * Declarative monster ability. The AI resolves these — monster content is
 * pure data, no per-monster code.
 */
export interface Attack {
  kind:
    | 'melee'        // hit an adjacent enemy
    | 'bolt'         // single-target ranged hit
    | 'beam'         // damages every tile along the ray
    | 'breath'       // cone from self toward target
    | 'burst'        // ball centred on self
    | 'blast'        // ball centred on target tile
    | 'summon'       // spawn minions nearby
    | 'buff_allies'  // apply buff to allies in radius
    | 'debuff'       // apply buff to a single enemy
    | 'heal_allies'
    | 'cloud'        // drop a cloud on the target tile
    | 'teleport'     // reposition self near target
    | 'pull'         // drag target toward self
    | 'push'         // shove target away
  name?: string
  cooldown?: number
  startCooldown?: number
  range?: number
  minRange?: number
  requiresLOS?: boolean
  damage?: number
  damageType?: DamageType
  radius?: number
  /** buff id from the buff registry, applied on hit */
  buff?: string
  buffDuration?: number
  buffPower?: number
  summonId?: string
  summonCount?: number
  /**
   * Maximum live minions this summoner may keep at once (default 4). Without a
   * cap a spawner out-produces any clear rate and the realm can never be
   * finished — it must be a source of pressure, not an infinite snowball.
   */
  summonCap?: number
  cloudKind?: string
  heal?: number
  color?: string
  /** monster spends its turn charging before this fires */
  telegraph?: boolean
}

export interface UnitDef {
  id: string
  name: string
  sprite: string
  color?: string
  maxHP: number
  /** spawn cost used by the level budget; also the SP value of the kill */
  level: number
  team?: Team
  flying?: boolean
  stationary?: boolean
  resists?: Partial<Record<DamageType, number>>
  tags?: CreatureTag[]
  attacks?: Attack[]
  shields?: number
  /** buff ids applied on spawn (auras, regeneration, etc.) */
  passives?: string[]
  /** spawn weight modifier for level generation */
  weight?: number
  /** minimum realm difficulty this creature appears at */
  minRealm?: number
  description?: string
  /** boss-scale creatures render at 2x and never spawn in packs */
  big?: boolean
  /** on death, spawn these */
  deathSpawn?: { id: string; count: number }
}

let nextUnitId = 1

export class Unit {
  readonly uid = nextUnitId++
  defId: string
  name: string
  sprite: string
  color: string
  x = 0
  y = 0
  hp: number
  maxHP: number
  shields: number
  team: Team
  flying: boolean
  stationary: boolean
  big: boolean
  isPlayer = false
  level: number
  resists: Record<DamageType, number>
  creatureTags: CreatureTag[]
  attacks: Attack[]
  cooldowns: number[]
  /** wizard spellbook (empty for monsters) */
  spells: SpellInst[] = []
  buffs: Buff[] = []
  /** temporary minion: turns left before it vanishes */
  summonTurns = -1
  /** cached spell bonuses (wizard) */
  bonuses: Bonuses = {}
  dead = false
  /** who summoned this unit, for kill attribution */
  summoner?: Unit
  def?: UnitDef
  /** set while a telegraphed attack is charging */
  charging?: { attack: Attack; x: number; y: number }
  /** cosmetic: flip sprite horizontally */
  facing = 1
  turnsAlive = 0

  constructor(def: UnitDef) {
    this.def = def
    this.defId = def.id
    this.name = def.name
    this.sprite = def.sprite
    this.color = def.color ?? '#ffffff'
    this.maxHP = def.maxHP
    this.hp = def.maxHP
    this.shields = def.shields ?? 0
    this.team = def.team ?? 'enemy'
    this.flying = def.flying ?? false
    this.stationary = def.stationary ?? false
    this.big = def.big ?? false
    this.level = def.level
    this.creatureTags = def.tags ? def.tags.slice() : ['living']
    this.attacks = def.attacks ? def.attacks.map(a => ({ ...a })) : []
    this.cooldowns = this.attacks.map(a => a.startCooldown ?? 0)
    this.resists = { physical: 0, fire: 0, lightning: 0, ice: 0, dark: 0, holy: 0, arcane: 0, poison: 0 }
    if (def.resists) {
      for (const t of DAMAGE_TYPES) {
        const v = def.resists[t]
        if (v !== undefined) this.resists[t] = v
      }
    }
  }

  get alive(): boolean { return !this.dead && this.hp > 0 }

  get stunned(): boolean { return this.buffs.some(b => b.stun) }
  get blinded(): boolean { return this.buffs.some(b => b.blind) }
  get berserk(): boolean { return this.buffs.some(b => b.berserk) }
  get rooted(): boolean { return this.buffs.some(b => b.rooted) }

  hasTag(t: CreatureTag): boolean { return this.creatureTags.includes(t) }

  buffOf(id: string): Buff | undefined { return this.buffs.find(b => b.id === id) }
  hasBuff(id: string): boolean { return this.buffs.some(b => b.id === id) }

  /** Effective resistance including buffs; 100 = immune, negative = vulnerable. */
  resistOf(t: DamageType): number {
    let r = this.resists[t]
    for (const b of this.buffs) {
      const v = b.resists?.[t]
      if (v !== undefined) r += v
    }
    return r
  }

  get effectiveMaxHP(): number {
    let m = this.maxHP
    for (const b of this.buffs) if (b.maxHPBonus) m += b.maxHPBonus
    return m
  }

  isHostileTo(other: Unit): boolean {
    if (this.berserk || other.berserk) return this !== other
    return this.team !== other.team
  }

  /** Sum of bonus contributions for `stat` across the given scopes. */
  bonusFor(stat: string, tags: readonly Tag[], spellId?: string): number {
    const table = this.bonuses[stat]
    if (!table) return 0
    let sum = table.all ?? 0
    for (const t of tags) sum += table[t as BonusScope] ?? 0
    if (spellId) sum += table[`spell:${spellId}` as BonusScope] ?? 0
    return sum
  }

  minionBonus(stat: string): number {
    const table = this.bonuses[stat]
    if (!table) return 0
    return (table.minion ?? 0)
  }
}
