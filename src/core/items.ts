import type { Game } from './game'

export interface ConsumableDef {
  id: string
  name: string
  sprite: string
  color: string
  desc: string
  /** does using it need a target? */
  target?: 'none' | 'tile' | 'enemy'
  range?: number
  radius?: number
  /** default true; set false for blindcast scrolls */
  requiresLOS?: boolean
  weight?: number
  use: (g: Game, x: number, y: number) => boolean
}

export interface InventoryEntry {
  id: string
  count: number
}

export const MAX_INVENTORY = 8

export function addConsumable(inv: InventoryEntry[], id: string, count = 1): boolean {
  const hit = inv.find(e => e.id === id)
  if (hit) { hit.count += count; return true }
  if (inv.length >= MAX_INVENTORY) return false
  inv.push({ id, count })
  return true
}

export function takeConsumable(inv: InventoryEntry[], id: string): boolean {
  const i = inv.findIndex(e => e.id === id)
  if (i < 0) return false
  inv[i].count--
  if (inv[i].count <= 0) inv.splice(i, 1)
  return true
}
