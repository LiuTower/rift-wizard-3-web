import type { UnitDef } from '../core/unit'
import type { SpriteDef } from '../render/sprite'

/** The wizard has no melee attack — everything comes from the spellbook. */
export const WIZARD_DEF: UnitDef = {
  id: 'wizard',
  name: '裂隙巫师',
  sprite: 'wizard',
  color: '#e8e0ff',
  maxHP: 60,
  level: 0,
  team: 'player',
  tags: ['living', 'arcane'],
  description: '就是你。不死、失忆，且耐心已经用完。',
}

export const units: UnitDef[] = [WIZARD_DEF]

export const sprites: Record<string, SpriteDef> = {
  wizard: {
    palette: ['#2a2440', '#c8c0e8', '#8a7ad0', '#ffffff'],
    wobble: 0.45,
    shapes: [
      // staff
      { t: 'line', pts: [0.78, 0.24, 0.68, 0.9], stroke: '#8a6a4a', w: 0.05 },
      { t: 'circle', x: 0.79, y: 0.2, r: 0.07, fill: '#ff5cc8', stroke: '#ffd0f0', w: 0.03 },
      // robe
      { t: 'poly', pts: [0.5, 0.36, 0.72, 0.9, 0.28, 0.9], fill: '$0', stroke: '$1', w: 0.05 },
      // sleeves
      { t: 'poly', pts: [0.33, 0.52, 0.2, 0.72, 0.31, 0.74], fill: '$0', stroke: '$1', w: 0.04 },
      // head
      { t: 'circle', x: 0.5, y: 0.33, r: 0.1, fill: '#e8d8c0', stroke: '$1', w: 0.035 },
      // hat
      { t: 'poly', pts: [0.5, 0.06, 0.68, 0.3, 0.32, 0.3], fill: '$2', stroke: '$1', w: 0.045 },
      { t: 'line', pts: [0.28, 0.31, 0.72, 0.31], stroke: '$1', w: 0.05 },
      // eyes
      { t: 'circle', x: 0.45, y: 0.34, r: 0.017, fill: '#101018' },
      { t: 'circle', x: 0.55, y: 0.34, r: 0.017, fill: '#101018' },
      // beard
      { t: 'poly', pts: [0.44, 0.4, 0.5, 0.56, 0.56, 0.4], fill: '$3', stroke: '$1', w: 0.025 },
    ],
  },
}
