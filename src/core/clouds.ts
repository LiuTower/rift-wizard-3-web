import type { Cloud } from './level'
import type { Game } from './game'
import { applyBuff } from './combat'
import { makeBuff } from './buffs'

export type CloudFactory = (x: number, y: number, duration: number, power?: number) => Cloud

export const CLOUDS: Record<string, CloudFactory> = {
  fire: (x, y, duration, p = 6) => ({
    kind: 'fire', name: '火焰云', x, y, duration,
    damage: p, damageType: 'fire', color: '#ff5219', sprite: 'cloud_fire',
  }),
  poison: (x, y, duration, p = 3) => ({
    kind: 'poison', name: '毒云', x, y, duration,
    damage: p, damageType: 'poison', color: '#5ad04a', sprite: 'cloud_poison',
    onStand(u, g) {
      const b = makeBuff('poisoned', 4, 1)
      if (b) applyBuff(g, u, b)
    },
  }),
  blizzard: (x, y, duration, p = 5) => ({
    kind: 'blizzard', name: '暴风雪', x, y, duration,
    damage: p, damageType: 'ice', color: '#7fd8ff', sprite: 'cloud_ice',
    onStand(u, g) {
      if (g.rng.chance(0.25)) {
        const b = makeBuff('frozen', 2)
        if (b) applyBuff(g, u, b)
      }
    },
  }),
  storm: (x, y, duration, p = 7) => ({
    kind: 'storm', name: '雷云', x, y, duration,
    damage: p, damageType: 'lightning', color: '#ffe019', sprite: 'cloud_storm',
  }),
  void: (x, y, duration, p = 8) => ({
    kind: 'void', name: '虚空裂缝', x, y, duration,
    damage: p, damageType: 'arcane', color: '#ff5cc8', sprite: 'cloud_void',
  }),
  gloom: (x, y, duration, p = 5) => ({
    kind: 'gloom', name: '幽暗', x, y, duration,
    damage: p, damageType: 'dark', color: '#a05ad0', sprite: 'cloud_dark',
  }),
  holy: (x, y, duration, p = 5) => ({
    kind: 'holy', name: '圣化', x, y, duration,
    damage: p, damageType: 'holy', color: '#fff5b0', sprite: 'cloud_holy',
  }),
  ash: (x, y, duration) => ({
    kind: 'ash', name: '窒息灰烬', x, y, duration,
    damage: 0, damageType: 'physical', color: '#6a6a72', sprite: 'cloud_ash',
    onStand(u, g) {
      const b = makeBuff('blind', 2)
      if (b) applyBuff(g, u, b)
    },
  }),
}

export function makeCloud(kind: string, x: number, y: number, duration: number, power?: number): Cloud | undefined {
  const f = CLOUDS[kind]
  return f ? f(x, y, duration, power) : undefined
}

/** Convenience for spells: drop a cloud, respecting walls, owned by a team. */
export function spawnCloud(g: Game, kind: string, x: number, y: number, duration: number, power?: number, friendly?: 'player' | 'enemy'): void {
  const c = makeCloud(kind, x, y, duration, power)
  if (!c) return
  if (friendly) c.friendly = friendly
  g.level.setCloud(c)
}
