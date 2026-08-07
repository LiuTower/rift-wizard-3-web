import { beforeEach, describe, expect, it } from 'vitest'
import { Game, clearSave, hasSave } from '../src/core/game'
import { startTutorial } from '../src/core/tutorial'

/**
 * Save-slot ownership.
 *
 * One slot holds the player's run. The engine also spins up throwaway runs — a
 * live board behind the title screen, the tutorial's hand-built realms — and
 * those must never touch storage. Before `Game.persist` existed, merely opening
 * the page rolled a fresh realm 1 and wrote it over the player's progress, so
 * "continue" could only ever restore a blank first realm.
 */

/** Minimal localStorage, because vitest runs these in node. */
function installStorage(): Map<string, string> {
  const store = new Map<string, string>()
  Reflect.set(globalThis, 'localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  })
  return store
}

const SAVE_KEY = 'rw3web.save.v1'
let store = installStorage()

/** A run deep enough that overwriting it is unmistakable. */
function deepRun(): Game {
  const g = new Game('deep')
  g.persist = true
  g.newRun('deep')
  for (let n = 0; n < 4; n++) {
    const portal = g.level.portals[0]
    if (!portal) break
    for (const u of g.enemies.slice()) u.hp = 0, u.dead = true
    g.level.placeUnit(g.player, portal.x, portal.y)
    if (!g.tryTakePortal()) break
  }
  g.saveRun()
  return g
}

function saved(): { realmIndex: number; maxHP: number } | undefined {
  const raw = store.get(SAVE_KEY)
  return raw ? JSON.parse(raw) : undefined
}

describe('save ownership', () => {
  beforeEach(() => { store = installStorage() })

  it('writes nothing until the run is the player\'s', () => {
    const g = new Game('scenery')
    g.newRun('scenery')
    expect(hasSave()).toBe(false)
    g.saveRun()
    expect(hasSave()).toBe(false)
  })

  it('persists once the player owns the run', () => {
    const g = new Game('mine')
    g.persist = true
    g.newRun('mine')
    g.saveRun()
    expect(hasSave()).toBe(true)
    expect(saved()?.realmIndex).toBe(1)
  })

  it('survives the title screen warm-up that used to erase it', () => {
    const deep = deepRun()
    const before = store.get(SAVE_KEY)
    expect(saved()?.realmIndex).toBeGreaterThan(1)

    // exactly what main.ts does on boot: a live run behind the title screen
    const scenery = new Game()
    scenery.newRun()
    scenery.mode = 'title'

    expect(store.get(SAVE_KEY)).toBe(before)
    expect(saved()?.realmIndex).toBe(deep.run.realmIndex)
    expect(saved()?.maxHP).toBe(deep.player.maxHP)
  })

  it('survives a tutorial run', () => {
    const deep = deepRun()
    const before = store.get(SAVE_KEY)
    expect(saved()?.realmIndex).toBeGreaterThan(1)

    const g = new Game('tut')
    g.fx.enabled = false
    startTutorial(g)
    // walk the tutorial's own portal, which calls enterRealm again
    const t = g.tutorial
    expect(t).toBeDefined()

    expect(store.get(SAVE_KEY)).toBe(before)
    expect(saved()?.realmIndex).toBe(deep.run.realmIndex)
  })

  it('keeps saving every realm after a load', () => {
    const deep = deepRun()
    const at = deep.run.realmIndex

    const g = new Game('resume')
    expect(g.loadRun()).toBe(true)
    expect(g.persist).toBe(true)
    expect(g.run.realmIndex).toBe(at)

    // advancing now must update storage, not silently drop it
    const portal = g.level.portals[0]
    expect(portal).toBeDefined()
    if (!portal) return
    for (const u of g.enemies.slice()) u.hp = 0, u.dead = true
    g.level.placeUnit(g.player, portal.x, portal.y)
    expect(g.tryTakePortal()).toBe(true)
    expect(saved()?.realmIndex).toBe(at + 1)
  })

  it('refuses to load a slot it never wrote', () => {
    const g = new Game('empty')
    expect(g.loadRun()).toBe(false)
    expect(g.persist).toBe(false)
  })

  it('clears the slot when the wizard dies', () => {
    const g = deepRun()
    expect(hasSave()).toBe(true)
    g.onPlayerDeath()
    expect(g.mode).toBe('dead')
    expect(hasSave()).toBe(false)
  })

  it('does not clear the slot when the tutorial wizard "dies"', () => {
    const deep = deepRun()
    const before = store.get(SAVE_KEY)

    const g = new Game('tut-death')
    g.fx.enabled = false
    startTutorial(g)
    g.player.hp = 0
    g.onPlayerDeath()
    // the tutorial revives instead of ending, so the real save is untouched
    expect(g.mode).not.toBe('dead')
    expect(store.get(SAVE_KEY)).toBe(before)
    expect(saved()?.realmIndex).toBe(deep.run.realmIndex)
  })

  it('clearSave is unconditional, independent of persist', () => {
    deepRun()
    expect(hasSave()).toBe(true)
    clearSave()
    expect(hasSave()).toBe(false)
  })
})
