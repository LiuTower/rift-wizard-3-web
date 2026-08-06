import type { SpellDef } from './spell'
import type { UnitDef } from './unit'
import type { ArtifactDef } from './crafting'
import type { ConsumableDef } from './items'
import type { SpriteDef } from '../render/sprite'

/**
 * Content is auto-registered: every module under src/content may export any of
 * `spells`, `units`, `artifacts`, `consumables`, `sprites`. No central index to
 * edit, so content packs never collide.
 */
export interface ContentModule {
  spells?: SpellDef[]
  units?: UnitDef[]
  artifacts?: ArtifactDef[]
  consumables?: ConsumableDef[]
  sprites?: Record<string, SpriteDef>
}

const modules = import.meta.glob<ContentModule>('../content/**/*.ts', { eager: true })

let spells: SpellDef[] = []
let units: UnitDef[] = []
let artifacts: ArtifactDef[] = []
let consumables: ConsumableDef[] = []
let sprites: Record<string, SpriteDef> = {}
const spellById = new Map<string, SpellDef>()
const unitById = new Map<string, UnitDef>()
const artifactById = new Map<string, ArtifactDef>()
const consumableById = new Map<string, ConsumableDef>()
let loaded = false

function load(): void {
  if (loaded) return
  loaded = true
  for (const [path, mod] of Object.entries(modules)) {
    for (const s of mod.spells ?? []) {
      if (spellById.has(s.id)) { console.warn(`duplicate spell id ${s.id} in ${path}`); continue }
      spellById.set(s.id, s); spells.push(s)
    }
    for (const u of mod.units ?? []) {
      if (unitById.has(u.id)) { console.warn(`duplicate unit id ${u.id} in ${path}`); continue }
      unitById.set(u.id, u); units.push(u)
    }
    for (const a of mod.artifacts ?? []) {
      if (artifactById.has(a.id)) { console.warn(`duplicate artifact id ${a.id} in ${path}`); continue }
      artifactById.set(a.id, a); artifacts.push(a)
    }
    for (const c of mod.consumables ?? []) {
      if (consumableById.has(c.id)) { console.warn(`duplicate consumable id ${c.id} in ${path}`); continue }
      consumableById.set(c.id, c); consumables.push(c)
    }
    if (mod.sprites) sprites = { ...sprites, ...mod.sprites }
  }
  spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
  units.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
  artifacts.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name))
}

export function getSpellDefs(): SpellDef[] { load(); return spells }
export function getSpellDef(id: string): SpellDef | undefined { load(); return spellById.get(id) }
export function getUnitDefs(): UnitDef[] { load(); return units }
export function getUnitDef(id: string): UnitDef | undefined { load(); return unitById.get(id) }
export function getArtifacts(): ArtifactDef[] { load(); return artifacts }
export function getArtifact(id: string): ArtifactDef | undefined { load(); return artifactById.get(id) }
export function getConsumables(): ConsumableDef[] { load(); return consumables }
export function getConsumable(id: string): ConsumableDef | undefined { load(); return consumableById.get(id) }
export function getSprites(): Record<string, SpriteDef> { load(); return sprites }

export function contentCounts(): { spells: number; units: number; artifacts: number; consumables: number; sprites: number } {
  load()
  return {
    spells: spells.length, units: units.length, artifacts: artifacts.length,
    consumables: consumables.length, sprites: Object.keys(sprites).length,
  }
}
