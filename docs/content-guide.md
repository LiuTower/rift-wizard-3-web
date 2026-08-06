# Content authoring guide

This is the contract for everything under `src/content/`. The engine lives in
`src/core/` and `src/render/` — **content modules never modify engine files.**

## Auto-registration

`src/core/registry.ts` globs `src/content/**/*.ts` eagerly. A content module may
export any of:

```ts
export const spells: SpellDef[]
export const units: UnitDef[]
export const artifacts: ArtifactDef[]
export const consumables: ConsumableDef[]
export const sprites: Record<string, SpriteDef>
```

Ids must be globally unique (duplicates are dropped with a console warning).
Every module is self-contained: **author the sprites for your own content in the
same file**, so packs never depend on each other.

## Sprite key convention

| content | key |
| --- | --- |
| monster `imp` | `mon_imp` |
| spell `fireball` | `icon_fireball` |
| artifact `ember_band` | `art_ember_band` |
| consumable `mana_potion` | `item_mana_potion` |

## Types

### SpellDef (`src/core/spell.ts`)

```ts
interface SpellDef {
  id: string            // snake_case, unique
  name: string          // Title Case, as shown in the spellbook
  level: number         // 1..8 = SP cost
  charges: number       // base charges per realm
  tags: Tag[]           // 1..4 tags, see below
  icon: string          // sprite key, e.g. 'icon_fireball'
  color?: string        // accent colour used by the UI and fx
  target: 'unit'|'enemy'|'ally'|'tile'|'empty'|'wall'|'self'
  requiresLOS?: boolean // default true
  hpCost?: number       // blood spells
  channel?: number      // repeats for N turns while the wizard holds still
  damageType?: DamageType // main damage school; inferred from the elemental tag when omitted
  stats: Record<string, number>   // damage, range, radius, duration, ...
  upgrades: UpgradeDef[]          // EXACTLY 4 options; the wizard may take 2
  desc: (s: SpellInst) => string  // must read live stats via s.st(...)
  cast: (s: SpellInst, g: Game, x: number, y: number) => void
  canTarget?: (s, g, x, y) => boolean
  aoe?: (s, g, x, y) => Point[]   // tiles highlighted while aiming
}

interface UpgradeDef {
  id: string      // unique within the spell
  name: string
  desc: string
  cost?: number   // SP, defaults to spell level
  mods?: Record<string, number>  // stat deltas
  flag?: string   // behaviour switch, tested with s.has('flag')
}
```

`Tag` = `'sorcery' | 'enchantment' | 'conjuration' | 'fire' | 'lightning' |
'ice' | 'nature' | 'arcane' | 'dark' | 'holy' | 'word' | 'orb' | 'dragon' |
'translocation' | 'metallic' | 'eye' | 'chaos' | 'blood'`.

Every spell needs exactly one of `sorcery` / `enchantment` / `conjuration`, plus
its elemental/special tags.

**Always read stats through `s.st('damage')`, `s.range`, `s.radius`,
`s.duration`** — never the raw `stats` object, or artifact bonuses and upgrades
will not apply. `s.has('flagname')` tests upgrade flags.

### UnitDef (`src/core/unit.ts`)

```ts
interface UnitDef {
  id: string; name: string; sprite: string; color?: string
  maxHP: number
  level: number          // 1..8 spawn cost; bosses use 9
  team?: 'player'|'enemy'  // default 'enemy'
  flying?: boolean         // crosses chasms
  stationary?: boolean     // never moves (spawners, totems)
  resists?: Partial<Record<DamageType, number>>  // 100 = immune, -100 = double
  tags?: CreatureTag[]     // 'living'|'undead'|'demon'|'construct'|'nature'|
                           // 'holy'|'dragon'|'elemental'|'chaos'|'arcane'|
                           // 'metallic'|'slime'|'spider'|'eye'|'boss'
  attacks?: Attack[]       // tried in order each turn
  shields?: number
  passives?: string[]      // buff ids applied on spawn (see buff table)
  weight?: number          // spawn weight, default 1
  minRealm?: number        // earliest realm it may appear in
  big?: boolean            // renders across 2x2 tiles (bosses)
  deathSpawn?: { id: string; count: number }
  description?: string     // shown when examining
}

interface Attack {
  kind: 'melee'|'bolt'|'beam'|'breath'|'burst'|'blast'|'summon'|'buff_allies'
      | 'debuff'|'heal_allies'|'cloud'|'teleport'|'pull'|'push'
  name?: string
  cooldown?: number      // turns before reuse
  startCooldown?: number
  range?: number         // default 1
  minRange?: number
  requiresLOS?: boolean  // default true
  damage?: number
  damageType?: DamageType
  radius?: number        // burst/blast/breath width, push/pull distance
  buff?: string          // buff id applied on hit
  buffDuration?: number
  buffPower?: number
  summonId?: string; summonCount?: number
  summonCap?: number     // max live minions this summoner keeps at once (default 4)
  cloudKind?: string
  heal?: number
  telegraph?: boolean    // charges this turn, fires next turn
  color?: string
}
```

`DamageType` = `'physical' | 'fire' | 'lightning' | 'ice' | 'dark' | 'holy' |
'arcane' | 'poison'`.

### ArtifactDef (`src/core/crafting.ts`)

```ts
interface ArtifactDef {
  id: string; name: string; sprite: string; color?: string
  slot: 'head'|'robe'|'amulet'|'ring1'|'ring2'|'gloves'|'boots'|'staff'|'relic'
  tier: number     // 1 early, 2 mid, 3 late
  desc: string
  cost: Partial<Record<'U'|'T'|'C'|'H'|'B'|'I'|'S'|'O', number>>
  bonuses?: Bonuses           // stat -> scope -> amount
  resists?: Partial<Record<DamageType, number>>
  maxHP?: number
  shields?: number
  buff?: () => Buff           // custom triggers
}
```

`Bonuses` scope is a `Tag`, `'all'`, `'minion'`, or `` `spell:${id}` ``:

```ts
bonuses: { damage: { fire: 2 }, radius: { sorcery: 1 }, charges: { all: 1 } }
// => +2 damage to fire spells, +1 radius to sorcery, +1 charge to everything
```

Component letters: `U` Umbral Dust (dark), `T` Thornseed (nature), `C` Cinder
(fire), `H` Halo Shard (holy), `B` Bloodglass (blood), `I` Rime Crystal (ice),
`S` Sparkstone (lightning), `O` Onyx Cog (metal/arcane).

Recipe sizes: tier 1 = 2-3 components, tier 2 = 4-5, tier 3 = 6-8.

### ConsumableDef (`src/core/items.ts`)

```ts
interface ConsumableDef {
  id: string; name: string; sprite: string; color: string; desc: string
  target?: 'none'|'tile'|'enemy'   // default 'none'
  range?: number; radius?: number
  requiresLOS?: boolean            // default true; false for blindcast scrolls
  weight?: number                  // drop weight
  use: (g: Game, x: number, y: number) => boolean  // false = cancel, no turn spent
}
```

`mana_potion` and `healing_potion` **must exist** — the run starts with one of each.

### SpriteDef (`src/render/sprite.ts`)

Vector shapes in a unit box (0..1, y down). Colours are hex or `$0`-style
palette refs. Vertices are auto-jittered for a hand-drawn feel.

```ts
type Shape =
  | { t:'poly'; pts:number[]; fill?:string; stroke?:string; w?:number; open?:boolean }
  | { t:'circle'; x:number; y:number; r:number; fill?:string; stroke?:string; w?:number }
  | { t:'ellipse'; x:number; y:number; rx:number; ry:number; rot?:number; fill?:string; stroke?:string; w?:number }
  | { t:'line'; pts:number[]; stroke:string; w?:number }
  | { t:'arc'; x:number; y:number; r:number; a0:number; a1:number; stroke:string; w?:number }
  | { t:'blob'; x:number; y:number; r:number; lobes?:number; fill?:string; stroke?:string; w?:number }
  | { t:'rect'; x:number; y:number; w:number; h:number; fill?:string; stroke?:string; sw?:number }

interface SpriteDef { shapes: Shape[]; palette?: string[]; wobble?: number; big?: boolean }
```

Style rules: black background, bright ink. Give every sprite a filled body in a
dark shade plus a light stroke (`w` 0.03-0.06), 4-9 shapes, silhouette readable
at 32 px. Eyes and highlights sell the creature — add them.

## Engine helpers

From `src/core/combat.ts`:

```ts
dealDamage(g, target, amount, type, source?, spell?): number
healUnit(g, target, amount): number
killUnit(g, target, killer?): void
applyBuff(g, target, buff): Buff | undefined
removeBuff(g, target, id): void
cleanse(g, target): number
summonUnit(g, defId, x, y, { team, duration, summoner, quiet }): Unit | undefined
teleportUnit(g, u, x, y): boolean
pushUnit(g, u, fromX, fromY, distance): void
pullUnit(g, u, toX, toY, distance): void
unitsNear(g, x, y, radius, filter?): Unit[]
findFreeTile(g, x, y, flying?, maxR?): {x,y} | undefined
digWall(g, x, y): boolean
```

From `src/core/buffs.ts`:

```ts
makeBuff(id, duration, power?): Buff | undefined
dot(id, name, type, dmg, duration, stacking?): Buff
resistBuff(id, name, resists, duration, color?): Buff
auraBuff(id, name, type, dmg, radius, duration): Buff
```

Buff ids: `stunned`, `frozen`, `petrified`, `glassified`, `poisoned`, `burning`,
`bleeding`, `berserk`, `blind`, `rooted`, `regen`, `shielded`, `hasted`,
`swift` (a second move but not a second attack), `ironskin`, `holy_armor`,
`frost_ward`, `arcane_ward`, `conductance`, `melted`,
`cursed`, `soul_marked`, `doomed`, `flame_aura`, `storm_aura`, `frost_aura`,
`toxic_aura`, `enchanted`, `vigor`, `channeling`.

Custom buffs are plain objects; hooks available: `onApply`, `onExpire`,
`onTurnStart`, `onTurnEnd`, `modifyIncoming`, `modifyOutgoing`, `onHurt`,
`onKill`, `onDeath`, `onCast`, `onMove`.

From `src/core/spell.ts`: `primaryDamageType(def)` resolves the school a spell
deals, for tooltips and resistance-aware logic.

From `src/core/clouds.ts`: `spawnCloud(g, kind, x, y, duration, power?, friendlyTeam?)`.
Cloud kinds: `fire`, `poison`, `blizzard`, `storm`, `void`, `gloom`, `holy`, `ash`.

From `src/core/geom.ts`: `ballPoints(cx,cy,r)`, `ringPoints`, `line`,
`conePoints(cx,cy,tx,ty,len,spread)`, `cheb`, `dist`, `DIRS8`, `clamp`.

Level queries: `g.level.unitAt(x,y)`, `.passable(x,y,flying)`, `.vacant(...)`,
`.hasLOS(x0,y0,x1,y1)`, `.raycast(x0,y0,x1,y1,maxLen)`, `.set(x,y,Tile.Wall|Floor|Chasm)`,
`.units`, `.w`, `.h`. Effects: `g.fx.bolt/beam/area/burst/ring/flash/float/strike`.
Logging: `g.log(text, color?)`. Random: `g.rng.chance(p)`, `.int(n)`, `.pick(arr)`.

## Balance targets

Spell damage / charges by level (single-target ~ AoE per tile):

| level | damage | charges |
| --- | --- | --- |
| 1 | 5-9 | 15-25 |
| 2 | 9-14 | 8-20 |
| 3 | 13-20 | 4-13 |
| 4 | 18-28 | 2-12 |
| 5 | 25-40 | 1-6 |
| 6 | 35-55 | 1-4 |
| 7 | 45-70 | 1-3 |
| 8 | realm-wide effects | 1 |

Monsters by level:

| level | HP | damage per attack |
| --- | --- | --- |
| 1 | 6-14 | 3-5 |
| 2 | 15-25 | 5-8 |
| 3 | 25-40 | 7-11 |
| 4 | 40-70 | 10-16 |
| 5 | 70-110 | 14-20 |
| 6 | 110-160 | 20-28 |
| 7 | 160-240 | 26-36 |
| 8 | 240-350 | 32-45 |
| boss (9) | 450-900 | 25-45, 3-5 abilities |

The wizard starts at 60 HP and 5 SP; realms grant 2-4 SP each (about 65 total).
Resistances: use 50/75/100 for themed defence and -50/-100 for weaknesses.
Never give a non-boss monster more than one attack with `range > 6`.

## Examples

```ts
import type { SpellDef } from '../../core/spell'
import type { SpriteDef } from '../../render/sprite'
import { ballPoints } from '../../core/geom'
import { dealDamage, applyBuff, summonUnit } from '../../core/combat'
import { makeBuff } from '../../core/buffs'

const fireball: SpellDef = {
  id: 'fireball', name: 'Fireball', level: 1, charges: 18,
  tags: ['sorcery', 'fire'], icon: 'icon_fireball', color: '#ff5219',
  target: 'tile',
  stats: { damage: 6, range: 8, radius: 2 },
  desc: s => `Deal ${s.st('damage')} fire damage in a radius ${s.radius} ball.`,
  aoe: (s, g, x, y) => ballPoints(x, y, s.radius),
  cast(s, g, x, y) {
    const tiles = ballPoints(x, y, s.radius).filter(p => g.level.hasLOS(x, y, p.x, p.y))
    g.fx.bolt(g.player.x, g.player.y, x, y, '#ff5219')
    g.fx.area(tiles, '#ff5219')
    for (const p of tiles) {
      const u = g.level.unitAt(p.x, p.y)
      if (u && u !== g.player) dealDamage(g, u, s.st('damage'), 'fire', g.player, s)
    }
  },
  upgrades: [
    { id: 'blast', name: 'Bigger Blast', desc: '+1 radius.', mods: { radius: 1 } },
    { id: 'hot', name: 'Searing', desc: '+4 damage.', mods: { damage: 4 } },
    { id: 'reach', name: 'Far Cast', desc: '+4 range.', mods: { range: 4 } },
    { id: 'ignite', name: 'Ignition', desc: 'Targets burn for 3 turns.', flag: 'ignite' },
  ],
}

const wolfSpell: SpellDef = {
  id: 'wolf', name: 'Wolf', level: 1, charges: 7,
  tags: ['conjuration', 'nature'], icon: 'icon_wolf', color: '#b0ff9a',
  target: 'empty',
  stats: { range: 4, minion_health: 14, minion_damage: 5 },
  desc: s => `Summon a wolf with ${s.st('minion_health')} HP.`,
  cast(s, g, x, y) {
    const u = summonUnit(g, 'wolf', x, y, { team: 'player' })
    if (u) { u.maxHP = s.st('minion_health'); u.hp = u.maxHP }
  },
  upgrades: [/* 4 options */],
}

export const spells: SpellDef[] = [fireball, wolfSpell]

export const sprites: Record<string, SpriteDef> = {
  icon_fireball: {
    palette: ['#ff5219', '#ffb03a', '#7a1d06'],
    shapes: [
      { t: 'blob', x: 0.5, y: 0.55, r: 0.32, lobes: 6, fill: '$2', stroke: '$0' },
      { t: 'blob', x: 0.5, y: 0.55, r: 0.18, lobes: 5, fill: '$0', stroke: '$1' },
    ],
  },
}
```

Note: a summoned creature also needs a `UnitDef` (`units` export) — either in
your own pack or an existing monster id.

## Rules

- No engine edits, no new dependencies, no `any`.
- Do **not** run builds, linters or the test suite; the integrator does that once.
- Keep files ASCII, 2-space indent, no semicolon-heavy style (match existing code).
- Descriptions are player-facing: short, concrete, no fluff.
