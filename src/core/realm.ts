import type { RNG } from './rng'
import type { CreatureTag } from './types'
import type { UnitDef } from './unit'
import { getUnitDefs } from './registry'

export interface BiomeDef {
  id: string
  name: string
  /** board colours */
  floor: string
  floorInk: string
  wall: string
  wallInk: string
  chasm: string
  wallPattern: 'stone' | 'bone' | 'brick' | 'ice' | 'root' | 'flesh' | 'void' | 'gold' | 'ash'
  floorPattern: 'hatch' | 'wave' | 'dot' | 'heart' | 'crack' | 'star' | 'grass'
  /** creature themes that spawn more often here */
  themes: CreatureTag[]
  /** display tags in the portal preview */
  tags: string[]
}

export const BIOMES: BiomeDef[] = [
  {
    id: 'stone', name: '残垣厅堂',
    floor: '#171a1d', floorInk: '#2b3138', wall: '#2a2723', wallInk: '#6a5f52', chasm: '#05070a',
    wallPattern: 'stone', floorPattern: 'hatch', themes: ['living', 'construct'], tags: ['石造'],
  },
  {
    id: 'crypt', name: '白骨陵墓',
    floor: '#14161c', floorInk: '#2e3240', wall: '#242028', wallInk: '#9a9280', chasm: '#04050a',
    wallPattern: 'bone', floorPattern: 'crack', themes: ['undead'], tags: ['亡灵', '黑暗'],
  },
  {
    id: 'hell', name: '余烬深坑',
    floor: '#1c1113', floorInk: '#43201c', wall: '#2e1a16', wallInk: '#8a3b22', chasm: '#150406',
    wallPattern: 'ash', floorPattern: 'crack', themes: ['demon', 'chaos'], tags: ['恶魔', '火焰'],
  },
  {
    id: 'rime', name: '霜寒荒野',
    floor: '#111a20', floorInk: '#28414f', wall: '#1d2a33', wallInk: '#7fb8d8', chasm: '#04080d',
    wallPattern: 'ice', floorPattern: 'star', themes: ['elemental', 'living'], tags: ['冰霜'],
  },
  {
    id: 'thicket', name: '妖精密林',
    floor: '#12190f', floorInk: '#28401f', wall: '#1c2a15', wallInk: '#5f9a3a', chasm: '#050a06',
    wallPattern: 'root', floorPattern: 'grass', themes: ['nature', 'spider'], tags: ['自然'],
  },
  {
    id: 'void', name: '虚空裂痕',
    floor: '#15111d', floorInk: '#35264a', wall: '#241a33', wallInk: '#a05ad0', chasm: '#0a0510',
    wallPattern: 'void', floorPattern: 'star', themes: ['arcane', 'eye'], tags: ['奥术'],
  },
  {
    id: 'heaven', name: '曦光之境',
    floor: '#1b1a14', floorInk: '#454026', wall: '#2a281c', wallInk: '#a89760', chasm: '#0a0a06',
    wallPattern: 'gold', floorPattern: 'dot', themes: ['holy'], tags: ['神圣'],
  },
  {
    id: 'foundry', name: '钢铁熔炉',
    floor: '#16171a', floorInk: '#33383f', wall: '#23252a', wallInk: '#7f8794', chasm: '#06070a',
    wallPattern: 'brick', floorPattern: 'dot', themes: ['construct', 'metallic'], tags: ['金属'],
  },
  {
    id: 'flesh', name: '血肉洞窟',
    floor: '#1d1113', floorInk: '#4a1a20', wall: '#2c1518', wallInk: '#b03040', chasm: '#120406',
    wallPattern: 'flesh', floorPattern: 'heart', themes: ['slime', 'demon'], tags: ['血肉'],
  },
  {
    id: 'swarm', name: '甲壳巢穴',
    floor: '#181510', floorInk: '#3a3220', wall: '#241f16', wallInk: '#8a7420', chasm: '#0a0806',
    wallPattern: 'bone', floorPattern: 'wave', themes: ['spider', 'nature'], tags: ['虫群'],
  },
]

export type RewardKind = 'components' | 'consumables' | 'skillpoint' | 'trove'

export const REWARD_NAMES: Record<RewardKind, string> = {
  components: '材料储藏',
  consumables: '药剂储藏',
  skillpoint: '远古神龛（+1 SP）',
  trove: '裂隙宝库（混合）',
}

export interface RealmDef {
  /** realm number, 1-based */
  index: number
  difficulty: number
  biome: BiomeDef
  seed: number
  /** species that populate the level */
  monsterIds: string[]
  /** expected counts, so the portal preview is honest */
  counts: Record<string, number>
  boss?: string
  reward: RewardKind
  tags: string[]
}

/** Highest monster level allowed at this difficulty. */
export function monsterCap(difficulty: number): number {
  return Math.max(1, Math.min(8, 1 + Math.floor(difficulty / 2.6)))
}

/**
 * Total spawn budget for a realm. The first two realms are a gentle on-ramp, and
 * growth slows past realm 10 because deep realms should field a few powerful
 * creatures rather than a wall of bodies (as the original does).
 */
export function spawnBudget(difficulty: number): number {
  const base = difficulty <= 10
    ? 4 + difficulty * 2.2
    : 4 + 10 * 2.2 + (difficulty - 10) * 1.2
  return Math.round(difficulty <= 2 ? base * 0.75 : base)
}

/** Cost of one creature against the budget. */
export function spawnCost(def: UnitDef): number {
  return Math.max(1, def.level * 2 - 1)
}

export const BOSS_REALMS: Record<number, string> = {
  8: 'boss_slazephan',
  13: 'boss_gaia',
  17: 'boss_void_elder',
  20: 'boss_mordred',
}

/** Build one candidate realm (a portal destination). */
export function makeRealm(rng: RNG, index: number, biomeHint?: BiomeDef): RealmDef {
  const difficulty = index
  const biome = biomeHint ?? rng.pick(BIOMES)
  const cap = monsterCap(difficulty)
  const pool = getUnitDefs().filter(d =>
    d.team !== 'player' && !d.tags?.includes('boss') &&
    d.level <= cap && (d.minRealm ?? 1) <= difficulty)

  const weightOf = (d: UnitDef) => {
    let w = d.weight ?? 1
    if (d.tags?.some(t => biome.themes.includes(t))) w *= 4
    // favour creatures near the difficulty ceiling as the run deepens
    w *= 1 + 0.5 * (d.level / cap)
    return w
  }

  const isRanged = (d: UnitDef): boolean => (d.attacks ?? []).some(a => (a.range ?? 1) > 2)
  // Early realms must stay winnable with one damage school: being shot from
  // four directions on turn one is the classic unfair opening, so cap how many
  // ranged species a shallow realm may roll.
  const rangedCap = difficulty <= 2 ? 1 : difficulty <= 5 ? 2 : 99

  const species: UnitDef[] = []
  let rangedPicked = 0
  const speciesCount = Math.min(pool.length, rng.range(2, 4))
  for (let guard = 0; species.length < speciesCount && pool.length && guard < 60; guard++) {
    const pick = rng.pickWeighted(pool, weightOf)
    if (species.includes(pick)) continue
    if (isRanged(pick)) {
      if (rangedPicked >= rangedCap) continue
      rangedPicked++
    }
    species.push(pick)
  }

  const boss = BOSS_REALMS[index]
  let budget = spawnBudget(difficulty)
  if (boss) budget = Math.round(budget * 0.4)

  const counts: Record<string, number> = {}
  // A shallow realm may field only a couple of ranged attackers in total; deep
  // realms lift the cap. Melee packs are the fair way to pressure a wizard.
  const rangedUnitCap = 1 + Math.floor(difficulty / 2)
  const melee = species.filter(s => !isRanged(s))
  if (species.length) {
    const cheapest = species.reduce((a, b) => spawnCost(a) <= spawnCost(b) ? a : b)
    for (let guard = 0; budget > 0 && guard < 200; guard++) {
      let def = rng.pick(species)
      if (isRanged(def) && (counts[def.id] ?? 0) >= rangedUnitCap && melee.length) def = rng.pick(melee)
      if (spawnCost(def) > budget) def = cheapest
      const cost = spawnCost(def)
      if (cost > budget) break
      counts[def.id] = (counts[def.id] ?? 0) + 1
      budget -= cost
    }
  }

  const reward: RewardKind = rng.pickWeighted<RewardKind>(
    ['components', 'consumables', 'skillpoint', 'trove'],
    r => r === 'components' ? 3 : r === 'consumables' ? 2 : r === 'skillpoint' ? 1.2 : 1,
  )

  const tags = biome.tags.slice()
  if (boss) tags.push('首领')

  return {
    index, difficulty, biome, seed: rng.u32(),
    monsterIds: Object.keys(counts), counts,
    boss, reward, tags,
  }
}

/** The portal choices offered after clearing a level. */
export function makeRealmOptions(rng: RNG, nextIndex: number, count = 3): RealmDef[] {
  const biomes = rng.sample(BIOMES, count)
  const out: RealmDef[] = []
  for (let i = 0; i < count; i++) out.push(makeRealm(rng, nextIndex, biomes[i]))
  return out
}
