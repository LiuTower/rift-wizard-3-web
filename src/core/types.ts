// Shared vocabulary for the whole game. Pure data, no imports.

export type DamageType =
  | 'physical'
  | 'fire'
  | 'lightning'
  | 'ice'
  | 'dark'
  | 'holy'
  | 'arcane'
  | 'poison'

export const DAMAGE_TYPES: readonly DamageType[] = [
  'physical', 'fire', 'lightning', 'ice', 'dark', 'holy', 'arcane', 'poison',
]

/** Palette lifted from the series' high-contrast-on-black look. */
export const DAMAGE_COLORS: Record<DamageType, string> = {
  physical: '#c8c8c8',
  fire: '#ff5219',
  lightning: '#ffe019',
  ice: '#7fd8ff',
  dark: '#a05ad0',
  holy: '#fff5b0',
  arcane: '#ff5cc8',
  poison: '#5ad04a',
}

/** Player-facing damage school names. */
export const DAMAGE_NAMES: Record<DamageType, string> = {
  physical: '物理',
  fire: '火焰',
  lightning: '闪电',
  ice: '冰霜',
  dark: '黑暗',
  holy: '神圣',
  arcane: '奥术',
  poison: '毒素',
}

export type Tag =
  // casting-style tags
  | 'sorcery' | 'enchantment' | 'conjuration'
  // elemental tags
  | 'fire' | 'lightning' | 'ice' | 'nature' | 'arcane' | 'dark' | 'holy'
  // special tags
  | 'word' | 'orb' | 'dragon' | 'translocation' | 'metallic' | 'eye' | 'chaos' | 'blood'

/**
 * Tags grouped the way the spell filter offers them, and the single source of
 * tag order for anything that enumerates them.
 */
export const TAG_GROUPS: readonly { label: string; tags: readonly Tag[] }[] = [
  { label: '施法风格', tags: ['sorcery', 'enchantment', 'conjuration'] },
  { label: '元素', tags: ['fire', 'lightning', 'ice', 'nature', 'arcane', 'dark', 'holy'] },
  { label: '特殊', tags: ['word', 'orb', 'dragon', 'translocation', 'metallic', 'eye', 'chaos', 'blood'] },
]

export const TAG_COLORS: Record<Tag, string> = {
  sorcery: '#ff8fd0',
  enchantment: '#9ad0ff',
  conjuration: '#b0ff9a',
  fire: '#ff5219',
  lightning: '#ffe019',
  ice: '#7fd8ff',
  nature: '#5ad04a',
  arcane: '#ff5cc8',
  dark: '#a05ad0',
  holy: '#fff5b0',
  word: '#ffffff',
  orb: '#c0a0ff',
  dragon: '#ff9a4a',
  translocation: '#8affea',
  metallic: '#c8ccd8',
  eye: '#ffd0f0',
  chaos: '#ff7a4a',
  blood: '#d02b3a',
}

/** Player-facing tag names, shown on spell cards and tooltips. */
export const TAG_NAMES: Record<Tag, string> = {
  sorcery: '咒法', enchantment: '附魔', conjuration: '召唤',
  fire: '火焰', lightning: '闪电', ice: '冰霜', nature: '自然',
  arcane: '奥术', dark: '黑暗', holy: '神圣',
  word: '言灵', orb: '法球', dragon: '巨龙', translocation: '位移',
  metallic: '金属', eye: '眼魔', chaos: '混乱', blood: '血魔',
}

/** Player-facing creature tag names. */
export const CREATURE_TAG_NAMES: Record<CreatureTag, string> = {
  living: '生者', undead: '亡灵', demon: '恶魔', construct: '构造体',
  nature: '自然', holy: '神圣', dragon: '巨龙', elemental: '元素',
  chaos: '混乱', arcane: '奥术', metallic: '金属', slime: '软泥',
  spider: '蛛形', eye: '眼魔', boss: '首领',
}

/** Creature descriptors used by spells, artifacts and monster synergies. */
export type CreatureTag =
  | 'living' | 'undead' | 'demon' | 'construct' | 'nature' | 'holy' | 'dragon'
  | 'elemental' | 'chaos' | 'arcane' | 'metallic' | 'slime' | 'spider' | 'eye' | 'boss'

export type Team = 'player' | 'enemy'

export const enum Tile {
  Floor = 0,
  Wall = 1,
  Chasm = 2,
}

/** Component letters shown in the sidebar, e.g. "U:2 T:4 C:2". */
export type ComponentId = 'U' | 'T' | 'C' | 'H' | 'B' | 'I' | 'S' | 'O'

export const COMPONENT_IDS: readonly ComponentId[] = ['U', 'T', 'C', 'H', 'B', 'I', 'S', 'O']

export interface ComponentInfo {
  id: ComponentId
  name: string
  color: string
  sprite: string
  /** Flavour: which tags the component tends to empower. */
  affinity: Tag[]
}

export const COMPONENTS: Record<ComponentId, ComponentInfo> = {
  U: { id: 'U', name: '幽影尘', color: '#a05ad0', sprite: 'comp_umbral', affinity: ['dark'] },
  T: { id: 'T', name: '荆棘种', color: '#5ad04a', sprite: 'comp_thorn', affinity: ['nature'] },
  C: { id: 'C', name: '余烬', color: '#ff5219', sprite: 'comp_cinder', affinity: ['fire'] },
  H: { id: 'H', name: '圣光碎片', color: '#fff5b0', sprite: 'comp_halo', affinity: ['holy'] },
  B: { id: 'B', name: '血玻璃', color: '#d02b3a', sprite: 'comp_blood', affinity: ['blood'] },
  I: { id: 'I', name: '霜晶', color: '#7fd8ff', sprite: 'comp_rime', affinity: ['ice'] },
  S: { id: 'S', name: '火花石', color: '#ffe019', sprite: 'comp_spark', affinity: ['lightning'] },
  O: { id: 'O', name: '玛瑙齿轮', color: '#c8ccd8', sprite: 'comp_onyx', affinity: ['metallic', 'arcane'] },
}

export type EquipSlot =
  | 'head' | 'robe' | 'amulet' | 'ring1' | 'ring2'
  | 'gloves' | 'boots' | 'staff' | 'relic'

export const EQUIP_SLOTS: readonly EquipSlot[] = [
  'head', 'robe', 'amulet', 'ring1', 'ring2', 'gloves', 'boots', 'staff', 'relic',
]

export const SLOT_NAMES: Record<EquipSlot, string> = {
  head: '头部', robe: '长袍', amulet: '项链', ring1: '戒指', ring2: '戒指',
  gloves: '手套', boots: '靴子', staff: '法杖', relic: '圣物',
}

/**
 * Bonus table: stat name -> scope -> amount.
 * Scope is a Tag, `'all'`, `'spell:<id>'`, or `'minion'`.
 * This mirrors the series' spell-bonus system: artifacts grant e.g.
 * `{ damage: { fire: 2 } }` meaning "+2 damage to fire spells".
 */
export type BonusScope = Tag | 'all' | 'minion' | `spell:${string}`
export type Bonuses = Partial<Record<string, Partial<Record<BonusScope, number>>>>

export type TargetKind =
  | 'unit'    // any unit
  | 'enemy'   // hostile unit
  | 'ally'    // friendly unit (incl. self)
  | 'tile'    // any point in range
  | 'empty'   // walkable, unoccupied point
  | 'wall'    // a wall tile
  | 'self'    // no targeting step

export interface Point { x: number; y: number }

export const TURN_LIMIT_NONE = -1
