import type { SpellDef, SpellInst } from '../../core/spell'
import type { Unit, UnitDef } from '../../core/unit'
import type { Game } from '../../core/game'
import type { SpriteDef } from '../../render/sprite'
import { DAMAGE_COLORS, type DamageType, type Point } from '../../core/types'
import { ballPoints, conePoints, dist, line, ringPoints } from '../../core/geom'
import { applyBuff, dealDamage, digWall, pushUnit, removeBuff, summonUnit, unitsNear } from '../../core/combat'
import { makeBuff } from '../../core/buffs'
import { spawnCloud } from '../../core/clouds'

// ---------------------------------------------------------------------- colour

const FIRE = '#ff5219'
const EMBER = '#ffb03a'
const MOLTEN = '#ff7a4a'
const SCORCH = '#ff8f5a'

// --------------------------------------------------------------------- helpers

/**
 * Everything a fire spell is allowed to burn: the wizard is never caught in his
 * own blast, but minions are: fire creatures are fire-immune, so the flame
 * gate's imps and the searing orb walk through it unharmed.
 */
function victims(g: Game, tiles: readonly Point[]): Unit[] {
  const out: Unit[] = []
  for (const p of tiles) {
    const u = g.level.unitAt(p.x, p.y)
    if (!u || !u.alive || u === g.player) continue
    if (out.includes(u)) continue
    out.push(u)
  }
  return out
}

/** Ball tiles that the blast can actually reach from its own centre. */
function blastTiles(g: Game, cx: number, cy: number, r: number): Point[] {
  return ballPoints(cx, cy, r).filter(p => g.level.inBounds(p.x, p.y) && g.level.hasLOS(cx, cy, p.x, p.y))
}

function burn(g: Game, u: Unit, duration: number, power: number): void {
  if (!u.alive) return
  const b = makeBuff('burning', duration, power)
  if (b) applyBuff(g, u, b)
}

// ------------------------------------------------------------------ 1. fireball

const fireball: SpellDef = {
  id: 'fireball', name: '火球', level: 1, charges: 18,
  tags: ['sorcery', 'fire'], icon: 'icon_fireball', color: FIRE,
  target: 'tile',
  stats: { damage: 6, range: 8, radius: 2, duration: 3 },
  flavor: '球里的一切都会烧起来。唯独你不会。',
  desc: s => `在半径 ${s.radius} 格的球形范围内造成 ${s.st('damage')} 点火焰伤害。`
    + (s.has('ignite') ? ` 幸存者燃烧 ${s.duration} 回合。` : ''),
  aoe: (s, g, x, y) => blastTiles(g, x, y, s.radius),
  cast(s, g, x, y) {
    const tiles = blastTiles(g, x, y, s.radius)
    g.fx.bolt(g.player.x, g.player.y, x, y, FIRE)
    g.fx.area(tiles, FIRE)
    g.fx.burst(x, y, s.radius, EMBER)
    for (const u of victims(g, tiles)) {
      dealDamage(g, u, s.st('damage'), 'fire', g.player, s)
      if (s.has('ignite')) burn(g, u, s.duration, 2)
    }
  },
  upgrades: [
    { id: 'blast', name: '更大爆炸', desc: '半径 +1。', mods: { radius: 1 } },
    { id: 'hot', name: '灼热高温', desc: '伤害 +4。', mods: { damage: 4 } },
    { id: 'reach', name: '远程施法', desc: '射程 +4。', mods: { range: 4 } },
    { id: 'ignite', name: '点燃', desc: '被命中的一切进入燃烧。', flag: 'ignite' },
  ],
}

// -------------------------------------------------------------- 2. fan of flames

function fanTiles(s: SpellInst, g: Game, x: number, y: number): Point[] {
  const px = g.player.x, py = g.player.y
  const spread = (s.st('arc') * Math.PI) / 180
  return conePoints(px, py, x, y, s.range, spread)
    .filter(p => g.level.inBounds(p.x, p.y) && g.level.hasLOS(px, py, p.x, p.y))
}

const fanOfFlames: SpellDef = {
  id: 'fan_of_flames', name: '烈焰扇', level: 2, charges: 18,
  tags: ['sorcery', 'fire'], icon: 'icon_fan_of_flames', color: EMBER,
  target: 'tile', channel: 3,
  stats: { damage: 9, range: 6, arc: 30, duration: 3 },
  flavor: '站定别动，火自己会烧。挪一步，扇子就合上了。',
  desc: s => `以 ${s.st('arc') * 2} 度、长 ${s.range} 格的锥形灼烧，造成 ${s.st('damage')} 点火焰伤害。`
    + ' 保持静止时持续 3 回合。'
    + (s.has('melt') ? ` 目标熔蚀 ${s.duration} 回合。` : ''),
  canTarget: (s, g, x, y) => x !== g.player.x || y !== g.player.y,
  aoe: (s, g, x, y) => fanTiles(s, g, x, y),
  cast(s, g, x, y) {
    const tiles = fanTiles(s, g, x, y)
    g.fx.flash(g.player.x, g.player.y, EMBER)
    g.fx.area(tiles, EMBER)
    for (const u of victims(g, tiles)) {
      dealDamage(g, u, s.st('damage'), 'fire', g.player, s)
      if (s.has('melt') && u.alive) {
        const b = makeBuff('melted', s.duration)
        if (b) applyBuff(g, u, b)
      }
    }
  },
  upgrades: [
    { id: 'wide', name: '宽幅扇', desc: '锥形角度 +40 度。', mods: { arc: 20 } },
    { id: 'long', name: '长焰扇', desc: '射程 +3。', mods: { range: 3 } },
    { id: 'hot', name: '白焰', desc: '伤害 +4。', mods: { damage: 4 } },
    { id: 'melt', name: '熔融热浪', desc: '目标受到的物理、火焰与冰霜伤害 +50%。', flag: 'melt' },
  ],
}

// ------------------------------------------------------------------- 3. immolate

const immolate: SpellDef = {
  id: 'immolate', name: '献火', level: 2, charges: 10,
  tags: ['sorcery', 'fire'], icon: 'icon_immolate', color: FIRE,
  target: 'enemy',
  stats: { damage: 14, range: 8, duration: 5, burn: 2 },
  desc: s => `造成 ${s.st('damage')} 点火焰伤害，并使目标燃烧 ${s.duration} 回合`
    + `（每回合 ${s.st('burn')} 点火焰伤害）。`
    + (s.has('spread') ? ' 其身旁的生物也会被点燃。' : ''),
  cast(s, g, x, y) {
    const target = g.level.unitAt(x, y)
    g.fx.bolt(g.player.x, g.player.y, x, y, FIRE)
    g.fx.flash(x, y, EMBER)
    if (!target) return
    dealDamage(g, target, s.st('damage'), 'fire', g.player, s)
    burn(g, target, s.duration, s.st('burn'))
    if (!s.has('spread')) return
    for (const v of unitsNear(g, x, y, 1, u => u !== target && u !== g.player && u.isHostileTo(g.player))) {
      g.fx.flash(v.x, v.y, EMBER)
      burn(g, v, s.duration, s.st('burn'))
    }
  },
  upgrades: [
    { id: 'blaze', name: '烈焰', desc: '伤害 +5。', mods: { damage: 5 } },
    { id: 'lasting', name: '慢燃', desc: '燃烧持续 +4 回合。', mods: { duration: 4 } },
    { id: 'fierce', name: '炽烈之焰', desc: '燃烧每回合伤害 +2。', mods: { burn: 2 } },
    { id: 'spread', name: '野火', desc: '相邻敌人也会被点燃。', flag: 'spread' },
  ],
}

// ----------------------------------------------------------- 4. pyrostatic pulse

const pyrostaticPulse: SpellDef = {
  id: 'pyrostatic_pulse', name: '焰电脉冲', level: 2, charges: 9,
  tags: ['sorcery', 'fire', 'lightning'], icon: 'icon_pyrostatic_pulse', color: '#ffe019',
  target: 'tile',
  stats: { damage: 9, lightning_damage: 6, range: 7, radius: 2, duration: 2 },
  flavor: '闪电认得火焰。领域里烧着的东西，一个都跑不掉。',
  desc: s => `在半径 ${s.radius} 格的球形范围内造成 ${s.st('damage')} 点火焰伤害，`
    + `随后对每个燃烧的生物造成 ${s.st('lightning_damage')} 点闪电伤害。`
    + (s.has('kindle') ? ` 目标会先燃烧 ${s.duration} 回合。` : ''),
  aoe: (s, g, x, y) => blastTiles(g, x, y, s.radius),
  cast(s, g, x, y) {
    const tiles = blastTiles(g, x, y, s.radius)
    g.fx.bolt(g.player.x, g.player.y, x, y, FIRE)
    g.fx.area(tiles, FIRE)
    for (const u of victims(g, tiles)) {
      dealDamage(g, u, s.st('damage'), 'fire', g.player, s)
      if (s.has('kindle')) burn(g, u, s.duration, 2)
    }
    g.fx.beat()
    const burning = g.level.units.filter(u => u.alive && u !== g.player && u.hasBuff('burning'))
    if (!burning.length) return
    const volt = s.st('lightning_damage')
    for (const u of burning) {
      if (!u.alive) continue
      g.fx.strike(u.x, u.y, '#ffe019')
      dealDamage(g, u, volt, 'lightning', g.player, s)
    }
  },
  upgrades: [
    { id: 'wide', name: '宽域脉冲', desc: '半径 +1。', mods: { radius: 1 } },
    { id: 'volt', name: '过载', desc: '闪电伤害 +4。', mods: { lightning_damage: 4 } },
    { id: 'reach', name: '远程脉冲', desc: '射程 +3。', mods: { range: 3 } },
    { id: 'kindle', name: '引燃', desc: '火焰会点燃目标，因此脉冲必定放电。', flag: 'kindle' },
  ],
}

// ------------------------------------------------------------- 5. chaos barrage

const CHAOS_TYPES: readonly DamageType[] = ['fire', 'lightning', 'physical']

const chaosBarrage: SpellDef = {
  id: 'chaos_barrage', name: '混乱弹幕', level: 2, charges: 8,
  tags: ['sorcery', 'chaos'], icon: 'icon_chaos_barrage', color: MOLTEN,
  target: 'self',
  stats: { damage: 7, range: 8, num_targets: 5, duration: 3 },
  flavor: '每一道弹自己挑目标，也自己挑元素。谁也不商量。',
  desc: s => `朝 ${s.range} 格内的随机敌人发射 ${s.st('num_targets')} 道弹。`
    + ` 每道造成 ${s.st('damage')} 点火焰、闪电或物理伤害。`
    + (s.has('unstable') ? ' 每种元素都会留下各自的负面效果。' : ''),
  cast(s, g) {
    const dmg = s.st('damage')
    const reach = s.range
    let fired = 0
    for (let i = 0; i < s.st('num_targets'); i++) {
      const foes = g.level.units.filter(u => u.alive && u.isHostileTo(g.player)
        && dist(g.player.x, g.player.y, u.x, u.y) <= reach + 0.001
        && g.level.hasLOS(g.player.x, g.player.y, u.x, u.y))
      if (!foes.length) break
      const target = g.rng.pick(foes)
      const type = g.rng.pick(CHAOS_TYPES)
      g.fx.bolt(g.player.x, g.player.y, target.x, target.y, DAMAGE_COLORS[type])
      dealDamage(g, target, dmg, type, g.player, s)
      if (s.has('unstable') && target.alive) {
        const id = type === 'fire' ? 'burning' : type === 'lightning' ? 'conductance' : 'bleeding'
        const b = makeBuff(id, s.duration, 2)
        if (b) applyBuff(g, target, b)
      }
      g.fx.beat()
      fired++
    }
    if (fired === 0) g.log('混乱之弹无处可打，纷纷熄灭。', '#8890a0')
  },
  upgrades: [
    { id: 'more', name: '更广弹幕', desc: '弹数 +2。', mods: { num_targets: 2 } },
    { id: 'power', name: '混乱涌动', desc: '每道弹伤害 +3。', mods: { damage: 3 } },
    { id: 'reach', name: '散射', desc: '射程 +4。', mods: { range: 4 } },
    { id: 'unstable', name: '不稳定弹', desc: '火焰造成燃烧，闪电施加导电，物理造成流血。', flag: 'unstable' },
  ],
}

// ------------------------------------------------------------------- 6. blazerip

/** The rip runs from the wizard through the aimed tile to the end of its range. */
function ripTiles(s: SpellInst, g: Game, x: number, y: number): Point[] {
  const px = g.player.x, py = g.player.y
  const dx = x - px, dy = y - py
  const steps = Math.max(Math.abs(dx), Math.abs(dy))
  if (steps === 0) return []
  const r = s.range
  const ex = px + Math.round((dx / steps) * r)
  const ey = py + Math.round((dy / steps) * r)
  const spine = line(px, py, ex, ey).slice(1).filter(p => g.level.inBounds(p.x, p.y))
  if (!s.has('wide')) return spine
  const ox = -Math.sign(dy), oy = Math.sign(dx)
  const out: Point[] = []
  const seen = new Set<number>()
  for (const p of spine) {
    for (let k = -1; k <= 1; k++) {
      const q = { x: p.x + ox * k, y: p.y + oy * k }
      if (!g.level.inBounds(q.x, q.y)) continue
      const key = q.y * g.level.w + q.x
      if (seen.has(key)) continue
      seen.add(key)
      out.push(q)
    }
  }
  return out
}

const blazerip: SpellDef = {
  id: 'blazerip', name: '烈焰裂空', level: 3, charges: 8,
  tags: ['sorcery', 'fire', 'arcane'], icon: 'icon_blazerip', color: SCORCH,
  target: 'tile', requiresLOS: false,
  stats: { damage: 14, range: 9, duration: 4 },
  flavor: '墙拦不住它。站在那条线上，是自己的问题。',
  desc: s => `撕开一条长 ${s.range} 格的火焰通道，对其中每个生物造成 ${s.st('damage')} 点火焰伤害，`
    + `并摧毁途经的墙壁。`
    + (s.has('wide') ? ' 通道宽 3 格。' : '')
    + (s.has('cinders') ? ` 每面被摧毁的墙留下一片火焰云，持续 ${s.duration} 回合。` : ''),
  canTarget: (s, g, x, y) => x !== g.player.x || y !== g.player.y,
  aoe: (s, g, x, y) => ripTiles(s, g, x, y),
  cast(s, g, x, y) {
    const tiles = ripTiles(s, g, x, y)
    if (!tiles.length) return
    const last = tiles[tiles.length - 1]
    g.fx.beam(g.player.x, g.player.y, last.x, last.y, SCORCH, 2)
    g.fx.area(tiles, FIRE)
    let torn = 0
    for (const p of tiles) {
      if (!digWall(g, p.x, p.y)) continue
      torn++
      if (s.has('cinders')) spawnCloud(g, 'fire', p.x, p.y, s.duration, 5)
    }
    for (const u of victims(g, tiles)) dealDamage(g, u, s.st('damage'), 'fire', g.player, s)
    if (torn > 0) g.log(`烈焰撕开了 ${torn} 面墙。`, SCORCH)
  },
  upgrades: [
    { id: 'far', name: '长裂', desc: '射程 +3。', mods: { range: 3 } },
    { id: 'sear', name: '灼裂', desc: '伤害 +5。', mods: { damage: 5 } },
    { id: 'wide', name: '宽裂', desc: '通道宽 3 格。', flag: 'wide' },
    { id: 'cinders', name: '余烬之石', desc: '被摧毁的墙留下火焰云。', flag: 'cinders' },
  ],
}

// ---------------------------------------------------------------- 7. flame burst

const flameBurst: SpellDef = {
  id: 'flame_burst', name: '烈焰爆发', level: 4, charges: 6,
  tags: ['sorcery', 'fire'], icon: 'icon_flame_burst', color: FIRE,
  target: 'self',
  stats: { damage: 22, radius: 4, duration: 4 },
  flavor: '以你为圆心。也只放过你。',
  desc: s => `爆发烈焰，对 ${s.radius} 格内的一切造成 ${s.st('damage')} 点火焰伤害。`
    + (s.has('ashes') ? ` 外缘充满致盲的灰烬，持续 ${s.duration} 回合。` : '')
    + (s.has('mantle') ? ` 你获得烈焰灵光，持续 ${s.duration + 2} 回合。` : ''),
  aoe: (s, g) => blastTiles(g, g.player.x, g.player.y, s.radius),
  cast(s, g) {
    const px = g.player.x, py = g.player.y
    const tiles = blastTiles(g, px, py, s.radius)
    g.fx.burst(px, py, s.radius, FIRE)
    g.fx.area(tiles, EMBER)
    g.fx.ring(px, py, s.radius, EMBER)
    for (const u of victims(g, tiles)) dealDamage(g, u, s.st('damage'), 'fire', g.player, s)
    if (s.has('ashes')) {
      for (const p of ringPoints(px, py, s.radius)) {
        if (!g.level.inBounds(p.x, p.y)) continue
        spawnCloud(g, 'ash', p.x, p.y, s.duration, undefined, 'player')
      }
    }
    if (s.has('mantle')) {
      const b = makeBuff('flame_aura', s.duration + 2, 4)
      if (b) applyBuff(g, g.player, b)
    }
  },
  upgrades: [
    { id: 'wave', name: '扩张波', desc: '半径 +2。', mods: { radius: 2 } },
    { id: 'inferno', name: '炼狱', desc: '伤害 +6。', mods: { damage: 6 } },
    { id: 'ashes', name: '窒息灰烬', desc: '外缘充满灰烬，使敌人失明。', flag: 'ashes' },
    { id: 'mantle', name: '烈焰披风', desc: '爆发后获得烈焰灵光。', flag: 'mantle' },
  ],
}

// ---------------------------------------------------------- 8. volcanic eruption

const volcanicEruption: SpellDef = {
  id: 'volcanic_eruption', name: '火山喷发', level: 4, charges: 5,
  tags: ['sorcery', 'fire'], icon: 'icon_volcanic_eruption', color: MOLTEN,
  target: 'tile',
  stats: { damage: 20, range: 7, radius: 2, duration: 6, cloud_damage: 5 },
  flavor: '它留下的云不认人，敌我一起烧。',
  desc: s => `地面炸裂，在半径 ${s.radius} 格的球形范围内造成 ${s.st('damage')} 点火焰伤害，`
    + `并填满火焰云（每回合 ${s.st('cloud_damage')} 点伤害），持续 ${s.duration} 回合。`
    + (s.has('shatter') ? ' 冲击会碎裂墙壁，并将幸存者击退。' : ''),
  aoe: (s, g, x, y) => blastTiles(g, x, y, s.radius),
  cast(s, g, x, y) {
    const tiles = blastTiles(g, x, y, s.radius)
    g.fx.strike(x, y, MOLTEN)
    g.fx.burst(x, y, s.radius, FIRE)
    g.fx.area(tiles, EMBER)
    const hit = victims(g, tiles)
    for (const u of hit) dealDamage(g, u, s.st('damage'), 'fire', g.player, s)
    if (s.has('shatter')) {
      for (const p of tiles) digWall(g, p.x, p.y)
      for (const u of hit) if (u.alive) pushUnit(g, u, x, y, 2)
    }
    g.fx.beat()
    for (const p of tiles) spawnCloud(g, 'fire', p.x, p.y, s.duration, s.st('cloud_damage'))
  },
  upgrades: [
    { id: 'wider', name: '更阔火山口', desc: '半径 +1。', mods: { radius: 1 } },
    { id: 'deeper', name: '更深喷口', desc: '伤害 +7。', mods: { damage: 7 } },
    { id: 'lingering', name: '残留岩浆', desc: '云雾持续时间 +4 回合，每回合伤害 +2。', mods: { duration: 4, cloud_damage: 2 } },
    { id: 'shatter', name: '碎裂冲击', desc: '摧毁墙壁，并将幸存者击退 2 格。', flag: 'shatter' },
  ],
}

// ---------------------------------------------------------------- 9. searing orb

const ORB_HP = 30
const ORB_DAMAGE = 10

const searingOrb: SpellDef = {
  id: 'searing_orb', name: '灼热法球', level: 6, charges: 3,
  tags: ['sorcery', 'orb', 'fire'], icon: 'icon_searing_orb', color: EMBER,
  target: 'empty',
  stats: { range: 6, duration: 12, radius: 2, minion_health: ORB_HP, minion_damage: ORB_DAMAGE },
  flavor: '法球自己会找上敌人，不必你操心。',
  desc: s => `召唤一颗 ${s.st('minion_health')} 点生命的灼热法球，它会朝敌人漂去，`
    + `每回合对 ${s.radius} 格内的一切造成 ${s.st('minion_damage')} 点火焰伤害。`
    + ` ${s.duration} 回合后消散。`
    + (s.has('trail') ? ' 它行进途中会留下火焰云。' : ''),
  aoe: (s, g, x, y) => blastTiles(g, x, y, s.radius),
  cast(s, g, x, y) {
    const orb = summonUnit(g, 'orb_searing', x, y, {
      team: 'player', summoner: g.player, duration: s.duration,
      hpBonus: s.st('minion_health') - ORB_HP,
      damageBonus: s.st('minion_damage') - ORB_DAMAGE,
    })
    if (!orb) {
      g.log('没有空间容纳法球。', '#ff9a9a')
      return
    }
    for (const a of orb.attacks) a.radius = s.radius
    g.fx.ring(orb.x, orb.y, s.radius, EMBER)
    if (s.has('trail')) {
      applyBuff(g, orb, {
        id: 'cinder_trail', name: '余烬轨迹', kind: 'buff', duration: -1, color: EMBER,
        desc: '离开的每一格都留下火焰云。',
        onMove(orbUnit, game, fromX, fromY) { spawnCloud(game, 'fire', fromX, fromY, 3, 4) },
      })
    }
  },
  upgrades: [
    { id: 'lasting', name: '持久法球', desc: '持续时间 +6 回合。', mods: { duration: 6 } },
    { id: 'hot', name: '灼热核心', desc: '法球伤害 +4。', mods: { minion_damage: 4 } },
    { id: 'corona', name: '宽阔日冕', desc: '法球半径 +1。', mods: { radius: 1 } },
    { id: 'trail', name: '余烬轨迹', desc: '法球身后留下火焰云。', flag: 'trail' },
  ],
}

// -------------------------------------------------------------- 10. rain of fire

const rainOfFire: SpellDef = {
  id: 'rain_of_fire', name: '火雨', level: 8, charges: 1,
  tags: ['sorcery', 'fire', 'word'], icon: 'icon_rain_of_fire', color: FIRE,
  target: 'self',
  stats: { damage: 26, radius: 2, impacts: 8, duration: 5 },
  flavor: '领域里的每个敌人都会被砸到。藏哪儿都一样。',
  desc: s => `烈火倾覆整个领域：每个敌人都会被一次半径 ${s.radius} 格的落点命中，`
    + `造成 ${s.st('damage')} 点火焰伤害，另有 ${s.st('impacts')} 次落点砸在随机地面上。`
    + (s.has('firestorm') ? ` 每次落点留下一片火焰云，持续 ${s.duration} 回合。` : ''),
  cast(s, g) {
    const dmg = s.st('damage')
    const r = s.radius
    const centres: Point[] = []
    for (const foe of g.level.units.filter(u => u.alive && u.isHostileTo(g.player))) {
      const near = ballPoints(foe.x, foe.y, 1).filter(p => g.level.passable(p.x, p.y, true))
      centres.push(near.length ? g.rng.pick(near) : { x: foe.x, y: foe.y })
    }
    const floors = [...g.level.floorTiles()]
    if (floors.length) {
      for (let i = 0; i < s.st('impacts'); i++) centres.push(g.rng.pick(floors))
    }
    if (!centres.length) return
    g.rng.shuffle(centres)
    g.log('天空裂开，然后燃烧。', FIRE)
    for (const c of centres) {
      const tiles = blastTiles(g, c.x, c.y, r)
      g.fx.strike(c.x, c.y, FIRE)
      g.fx.area(tiles, EMBER)
      for (const u of victims(g, tiles)) dealDamage(g, u, dmg, 'fire', g.player, s)
      if (s.has('firestorm')) spawnCloud(g, 'fire', c.x, c.y, s.duration, 6)
      g.fx.beat()
    }
  },
  upgrades: [
    { id: 'power', name: '天灾', desc: '每次落点伤害 +8。', mods: { damage: 8 } },
    { id: 'wide', name: '重型弹幕', desc: '落点半径 +1。', mods: { radius: 1 } },
    { id: 'more', name: '无尽之雨', desc: '随机落点 +6 次。', mods: { impacts: 6 } },
    { id: 'firestorm', name: '火焰风暴', desc: '每次落点都留下火焰云。', flag: 'firestorm' },
  ],
}

// ---------------------------------------------------------------- 11. flame gate

const IMP_HP = 12
const IMP_DAMAGE = 5

const flameGate: SpellDef = {
  id: 'flame_gate', name: '烈焰之门', level: 3, charges: 6,
  tags: ['enchantment', 'fire', 'conjuration'], icon: 'icon_flame_gate', color: EMBER,
  target: 'self',
  stats: { duration: 8, minion_health: IMP_HP, minion_damage: IMP_DAMAGE, minion_duration: 8 },
  flavor: '法术落在哪，小鬼就从哪爬出来。',
  desc: s => `在 ${s.duration} 回合内，你施放的每个火焰法术都会在其目标处额外召唤`
    + `${s.has('twin') ? ' 2 只焰生小鬼' : '一只焰生小鬼'}`
    + `（${s.st('minion_health')} 点生命，${s.st('minion_damage')} 点火焰伤害`
    + `${s.has('eternal') ? '' : `，持续 ${s.st('minion_duration')} 回合`}）。`,
  cast(s, g) {
    const count = s.has('twin') ? 2 : 1
    const hpBonus = s.st('minion_health') - IMP_HP
    const damageBonus = s.st('minion_damage') - IMP_DAMAGE
    const impDuration = s.has('eternal') ? 0 : s.st('minion_duration')
    // Recast replaces the open gate, so the newest upgrades take effect.
    removeBuff(g, g.player, 'flame_gate')
    applyBuff(g, g.player, {
      id: 'flame_gate', name: '烈焰之门', kind: 'buff', duration: s.duration, color: EMBER,
      desc: `你施放的每个火焰法术都会召唤${count > 1 ? ` ${count} 只焰生小鬼` : '一只焰生小鬼'}。`,
      onApply(wiz, game) { game.fx.ring(wiz.x, wiz.y, 2, EMBER) },
      onExpire(wiz, game) { game.log('烈焰之门关闭了。', '#8890a0') },
      onCast(wiz, game, sp, x, y) {
        if (sp.id === 'flame_gate' || !sp.tags.includes('fire')) return
        game.fx.flash(x, y, EMBER)
        for (let i = 0; i < count; i++) {
          summonUnit(game, 'imp_flame', x, y, {
            team: 'player', summoner: wiz, quiet: i > 0,
            duration: impDuration, hpBonus, damageBonus,
          })
        }
      },
    })
    g.log('一道烈焰之门在你肩侧开启。', EMBER)
  },
  upgrades: [
    { id: 'long', name: '持续之门', desc: '持续时间 +5 回合。', mods: { duration: 5 } },
    { id: 'twin', name: '双生之门', desc: '每个火焰法术召唤 2 只小鬼。', flag: 'twin' },
    { id: 'greater', name: '强化小鬼', desc: '小鬼生命 +8，伤害 +3。', mods: { minion_health: 8, minion_damage: 3 } },
    { id: 'eternal', name: '永恒仆从', desc: '小鬼永不消失。', flag: 'eternal' },
  ],
}

// ----------------------------------------------------------------------- exports

export const spells: SpellDef[] = [
  fireball, fanOfFlames, immolate, pyrostaticPulse, chaosBarrage, blazerip,
  flameBurst, volcanicEruption, searingOrb, rainOfFire, flameGate,
]

export const units: UnitDef[] = [
  {
    id: 'imp_flame', name: '焰生小鬼', sprite: 'mon_imp_flame', color: SCORCH,
    maxHP: IMP_HP, level: 1, team: 'player', flying: true,
    tags: ['demon', 'elemental'],
    resists: { fire: 100, ice: -50 },
    attacks: [
      { kind: 'bolt', name: '火焰箭', range: 4, damage: IMP_DAMAGE, damageType: 'fire', color: FIRE },
    ],
    description: '从烈焰之门里拽出来的余烬之翼小鬼。火伤不了它。',
  },
  {
    id: 'orb_searing', name: '灼热法球', sprite: 'mon_orb_searing', color: EMBER,
    maxHP: ORB_HP, level: 6, team: 'player', flying: true, stationary: false,
    tags: ['elemental', 'construct'],
    resists: { fire: 100, physical: 50, ice: -50 },
    attacks: [
      { kind: 'burst', name: '日冕', radius: 2, damage: ORB_DAMAGE, damageType: 'fire', color: EMBER },
    ],
    description: '一颗漂浮的白焰之球。它从不出手，只是周围的空气在燃烧。',
  },
]

export const sprites: Record<string, SpriteDef> = {
  icon_fireball: {
    palette: ['#ff5219', '#ffb03a', '#7a1d06', '#ffe6a0'],
    shapes: [
      { t: 'blob', x: 0.5, y: 0.56, r: 0.32, lobes: 6, fill: '$2', stroke: '$0', w: 0.05 },
      { t: 'blob', x: 0.5, y: 0.58, r: 0.19, lobes: 5, fill: '$0', stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.5, y: 0.58, r: 0.07, fill: '$3' },
      { t: 'poly', pts: [0.34, 0.3, 0.44, 0.06, 0.5, 0.26], fill: '$0', stroke: '$1', w: 0.03 },
      { t: 'poly', pts: [0.56, 0.28, 0.66, 0.1, 0.7, 0.32], fill: '$0', stroke: '$1', w: 0.03 },
    ],
  },

  icon_fan_of_flames: {
    palette: ['#ffb03a', '#ff5219', '#5a1f04', '#ffe6a0'],
    shapes: [
      { t: 'poly', pts: [0.14, 0.9, 0.86, 0.5, 0.92, 0.88], fill: '$2', stroke: '$0', w: 0.045 },
      { t: 'poly', pts: [0.14, 0.9, 0.78, 0.24, 0.88, 0.48], fill: '$2', stroke: '$0', w: 0.04 },
      { t: 'line', pts: [0.2, 0.86, 0.72, 0.56], stroke: '$1', w: 0.045 },
      { t: 'line', pts: [0.2, 0.86, 0.66, 0.34], stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.16, y: 0.88, r: 0.08, fill: '$1', stroke: '$3', w: 0.03 },
    ],
  },

  icon_immolate: {
    palette: ['#ff5219', '#ffb03a', '#4a1404', '#ffe6a0'],
    shapes: [
      { t: 'blob', x: 0.5, y: 0.5, r: 0.36, lobes: 7, fill: '$2', stroke: '$0', w: 0.05 },
      { t: 'poly', pts: [0.5, 0.26, 0.62, 0.62, 0.5, 0.84, 0.38, 0.62], fill: '#150a08', stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.5, y: 0.3, r: 0.075, fill: '#150a08', stroke: '$1', w: 0.03 },
      { t: 'circle', x: 0.47, y: 0.3, r: 0.02, fill: '$3' },
      { t: 'circle', x: 0.53, y: 0.3, r: 0.02, fill: '$3' },
      { t: 'poly', pts: [0.3, 0.36, 0.36, 0.12, 0.44, 0.34], fill: '$0', stroke: '$1', w: 0.028 },
      { t: 'poly', pts: [0.58, 0.34, 0.66, 0.12, 0.72, 0.38], fill: '$0', stroke: '$1', w: 0.028 },
    ],
  },

  icon_pyrostatic_pulse: {
    palette: ['#ff5219', '#ffe019', '#5a1f04', '#fff5b0'],
    shapes: [
      { t: 'circle', x: 0.5, y: 0.5, r: 0.36, fill: '$2', stroke: '$0', w: 0.05 },
      { t: 'arc', x: 0.5, y: 0.5, r: 0.26, a0: 0.4, a1: 5.2, stroke: '$0', w: 0.05 },
      { t: 'poly', pts: [0.46, 0.14, 0.62, 0.44, 0.52, 0.46, 0.62, 0.84, 0.4, 0.52, 0.5, 0.5], fill: '$1', stroke: '$3', w: 0.028 },
      { t: 'circle', x: 0.5, y: 0.5, r: 0.06, fill: '$1' },
      { t: 'line', pts: [0.14, 0.24, 0.24, 0.34], stroke: '$0', w: 0.04 },
      { t: 'line', pts: [0.86, 0.72, 0.76, 0.62], stroke: '$0', w: 0.04 },
    ],
  },

  icon_chaos_barrage: {
    palette: ['#ff7a4a', '#ff5219', '#ffe019', '#c8c8c8'],
    shapes: [
      { t: 'blob', x: 0.5, y: 0.78, r: 0.17, lobes: 5, fill: '#3a1206', stroke: '$0', w: 0.045 },
      { t: 'poly', pts: [0.46, 0.7, 0.2, 0.2, 0.3, 0.16, 0.52, 0.66], fill: '$1', stroke: '$0', w: 0.025 },
      { t: 'poly', pts: [0.5, 0.68, 0.5, 0.1, 0.58, 0.14, 0.56, 0.68], fill: '$2', stroke: '$0', w: 0.025 },
      { t: 'poly', pts: [0.54, 0.7, 0.82, 0.24, 0.86, 0.32, 0.6, 0.72], fill: '$3', stroke: '$0', w: 0.025 },
      { t: 'circle', x: 0.5, y: 0.78, r: 0.06, fill: '$2' },
    ],
  },

  icon_blazerip: {
    palette: ['#ff8f5a', '#ff5219', '#4a1404', '#ffe6a0'],
    shapes: [
      { t: 'poly', pts: [0.06, 0.5, 0.34, 0.38, 0.66, 0.44, 0.94, 0.34, 0.94, 0.62, 0.62, 0.56, 0.32, 0.62, 0.06, 0.66], fill: '$2', stroke: '$0', w: 0.045 },
      { t: 'line', pts: [0.08, 0.5, 0.92, 0.48], stroke: '$3', w: 0.05 },
      { t: 'line', pts: [0.3, 0.4, 0.24, 0.16], stroke: '$1', w: 0.035 },
      { t: 'line', pts: [0.7, 0.56, 0.76, 0.84], stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.5, y: 0.5, r: 0.1, fill: '$1', stroke: '$3', w: 0.03 },
    ],
  },

  icon_flame_burst: {
    palette: ['#ff5219', '#ffb03a', '#5a1f04', '#ffe6a0'],
    shapes: [
      { t: 'circle', x: 0.5, y: 0.5, r: 0.42, fill: '$2', stroke: '$0', w: 0.04 },
      { t: 'arc', x: 0.5, y: 0.5, r: 0.3, a0: 0, a1: 6.28, stroke: '$1', w: 0.045 },
      { t: 'blob', x: 0.5, y: 0.5, r: 0.16, lobes: 6, fill: '$0', stroke: '$3', w: 0.03 },
      { t: 'line', pts: [0.5, 0.08, 0.5, 0.24], stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.5, 0.76, 0.5, 0.92], stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.08, 0.5, 0.24, 0.5], stroke: '$1', w: 0.04 },
      { t: 'line', pts: [0.76, 0.5, 0.92, 0.5], stroke: '$1', w: 0.04 },
    ],
  },

  icon_volcanic_eruption: {
    palette: ['#ff5219', '#ffb03a', '#3a2a24', '#6a6a72'],
    shapes: [
      { t: 'poly', pts: [0.1, 0.92, 0.38, 0.42, 0.62, 0.42, 0.9, 0.92], fill: '$2', stroke: '#8a7a6a', w: 0.045 },
      { t: 'poly', pts: [0.38, 0.42, 0.5, 0.52, 0.62, 0.42], fill: '$0', stroke: '$1', w: 0.03 },
      { t: 'poly', pts: [0.42, 0.4, 0.3, 0.14, 0.5, 0.24, 0.62, 0.06, 0.6, 0.4], fill: '$0', stroke: '$1', w: 0.035 },
      { t: 'circle', x: 0.24, y: 0.2, r: 0.06, fill: '$3', stroke: '$1', w: 0.025 },
      { t: 'circle', x: 0.76, y: 0.28, r: 0.05, fill: '$3', stroke: '$1', w: 0.025 },
      { t: 'line', pts: [0.3, 0.72, 0.44, 0.56], stroke: '$0', w: 0.035 },
      { t: 'line', pts: [0.7, 0.74, 0.58, 0.58], stroke: '$0', w: 0.035 },
    ],
  },

  icon_searing_orb: {
    palette: ['#ffb03a', '#ff5219', '#5a2a04', '#fff5d0'],
    shapes: [
      { t: 'circle', x: 0.5, y: 0.5, r: 0.24, fill: '$2', stroke: '$0', w: 0.05 },
      { t: 'circle', x: 0.5, y: 0.5, r: 0.12, fill: '$1', stroke: '$3', w: 0.03 },
      { t: 'arc', x: 0.5, y: 0.5, r: 0.38, a0: -0.6, a1: 2.2, stroke: '$0', w: 0.04 },
      { t: 'arc', x: 0.5, y: 0.5, r: 0.38, a0: 2.6, a1: 5.4, stroke: '$0', w: 0.04 },
      { t: 'line', pts: [0.5, 0.04, 0.5, 0.16], stroke: '$0', w: 0.035 },
      { t: 'line', pts: [0.5, 0.84, 0.5, 0.96], stroke: '$0', w: 0.035 },
    ],
  },

  icon_rain_of_fire: {
    palette: ['#ff5219', '#ffb03a', '#3a2028', '#ffe6a0'],
    shapes: [
      { t: 'blob', x: 0.5, y: 0.28, r: 0.24, lobes: 5, fill: '$2', stroke: '$0', w: 0.045 },
      { t: 'line', pts: [0.26, 0.3, 0.74, 0.28], stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.5, y: 0.24, r: 0.06, fill: '$3' },
      { t: 'poly', pts: [0.24, 0.5, 0.3, 0.72, 0.2, 0.88, 0.16, 0.66], fill: '$0', stroke: '$1', w: 0.028 },
      { t: 'poly', pts: [0.48, 0.54, 0.56, 0.78, 0.46, 0.94, 0.4, 0.72], fill: '$0', stroke: '$1', w: 0.028 },
      { t: 'poly', pts: [0.72, 0.48, 0.8, 0.7, 0.72, 0.86, 0.66, 0.66], fill: '$0', stroke: '$1', w: 0.028 },
    ],
  },

  icon_flame_gate: {
    palette: ['#ffb03a', '#ff5219', '#3a1206', '#ffe6a0'],
    shapes: [
      { t: 'poly', pts: [0.22, 0.92, 0.22, 0.42, 0.5, 0.14, 0.78, 0.42, 0.78, 0.92], fill: '$2', stroke: '$0', w: 0.05 },
      { t: 'poly', pts: [0.34, 0.92, 0.34, 0.48, 0.5, 0.3, 0.66, 0.48, 0.66, 0.92], fill: '#0e0608', stroke: '$1', w: 0.035 },
      { t: 'poly', pts: [0.4, 0.9, 0.46, 0.62, 0.52, 0.76, 0.58, 0.58, 0.62, 0.9], fill: '$1', stroke: '$3', w: 0.03 },
      { t: 'circle', x: 0.46, y: 0.54, r: 0.026, fill: '$3' },
      { t: 'circle', x: 0.56, y: 0.54, r: 0.026, fill: '$3' },
      { t: 'line', pts: [0.16, 0.92, 0.84, 0.92], stroke: '$0', w: 0.045 },
    ],
  },

  mon_imp_flame: {
    palette: ['#5a1f04', '#ff8f5a', '#ffe6a0', '#ff5219'],
    wobble: 0.6,
    shapes: [
      { t: 'poly', pts: [0.5, 0.44, 0.14, 0.28, 0.26, 0.58], fill: '$0', stroke: '$1', w: 0.035 },
      { t: 'poly', pts: [0.5, 0.44, 0.86, 0.28, 0.74, 0.58], fill: '$0', stroke: '$1', w: 0.035 },
      { t: 'blob', x: 0.5, y: 0.58, r: 0.2, lobes: 5, fill: '$0', stroke: '$1', w: 0.04 },
      { t: 'circle', x: 0.5, y: 0.36, r: 0.13, fill: '$0', stroke: '$1', w: 0.035 },
      { t: 'poly', pts: [0.4, 0.26, 0.34, 0.08, 0.47, 0.2], fill: '$3', stroke: '$1', w: 0.025 },
      { t: 'poly', pts: [0.6, 0.26, 0.66, 0.08, 0.53, 0.2], fill: '$3', stroke: '$1', w: 0.025 },
      { t: 'circle', x: 0.45, y: 0.36, r: 0.028, fill: '$2' },
      { t: 'circle', x: 0.55, y: 0.36, r: 0.028, fill: '$2' },
      { t: 'line', pts: [0.52, 0.74, 0.64, 0.92], stroke: '$1', w: 0.03 },
    ],
  },

  mon_orb_searing: {
    palette: ['#7a3a06', '#ffb03a', '#fff5d0', '#ff5219'],
    wobble: 0.7,
    shapes: [
      { t: 'circle', x: 0.5, y: 0.5, r: 0.3, fill: '$0', stroke: '$1', w: 0.05 },
      { t: 'blob', x: 0.5, y: 0.5, r: 0.18, lobes: 6, fill: '$3', stroke: '$2', w: 0.03 },
      { t: 'circle', x: 0.5, y: 0.5, r: 0.07, fill: '$2' },
      { t: 'arc', x: 0.5, y: 0.5, r: 0.4, a0: 0.2, a1: 2.6, stroke: '$1', w: 0.045 },
      { t: 'arc', x: 0.5, y: 0.5, r: 0.4, a0: 3.4, a1: 5.8, stroke: '$1', w: 0.045 },
      { t: 'line', pts: [0.34, 0.78, 0.3, 0.92], stroke: '$3', w: 0.03 },
      { t: 'line', pts: [0.66, 0.78, 0.7, 0.92], stroke: '$3', w: 0.03 },
    ],
  },
}
