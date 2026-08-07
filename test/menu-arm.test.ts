import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Game } from '../src/core/game'
import { menuArmed, renderOverlay } from '../src/ui/overlays'

/**
 * jsdom is not a dependency here, so these run in vitest's default node environment
 * against a stub `document`: renderOverlay updates the arm clock before it looks up
 * `#overlay`, then bails on the missing root. The real renderOverlay bookkeeping and
 * the real `menuArmed` comparison are under test; only the drawing is skipped.
 */
const NO_DOM = { getElementById: (): null => null }

/** Mirrors MENU_ARM_MS in src/ui/overlays.ts. */
const ARM_MS = 400

const show = (mode: string): void => { renderOverlay({ mode } as unknown as Game) }

// A menu only disarms on entry, and module state persists across tests in a file,
// so every case arrives at its menu from gameplay rather than assuming a fresh mode.
const enter = (mode: string): void => { show('play'); show(mode) }

// The arm delay is read off `performance.now()`, so the clock is driven by hand:
// a real wait would tie the suite to wall time and eventually race.
let clock = 0
let realDocument: unknown

beforeEach(() => {
  clock = 10_000
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  const host = globalThis as unknown as { document: unknown }
  realDocument = host.document
  host.document = NO_DOM
})

afterEach(() => {
  vi.restoreAllMocks()
  const host = globalThis as unknown as { document: unknown }
  host.document = realDocument
})

describe('menu arm delay', () => {
  it('disarms the death screen the moment it appears', () => {
    enter('dead')
    expect(menuArmed()).toBe(false)
  })

  it('arms the death screen exactly once the delay has elapsed', () => {
    enter('dead')
    clock += ARM_MS - 1
    expect(menuArmed()).toBe(false)
    clock += 1
    expect(menuArmed()).toBe(true)
  })

  it('disarms every irreversible summary screen, not just death', () => {
    for (const mode of ['dead', 'win', 'tutorialEnd']) {
      enter(mode)
      expect(menuArmed(), mode).toBe(false)
    }
  })

  it('never delays menus the player opened on purpose', () => {
    for (const mode of ['title', 'menu']) {
      enter(mode)
      expect(menuArmed(), mode).toBe(true)
      show(mode)
      expect(menuArmed(), `${mode} re-render`).toBe(true)
    }
  })

  it('keeps the clock running across re-renders of the same mode', () => {
    enter('dead')
    clock += ARM_MS
    expect(menuArmed()).toBe(true)
    // The death screen re-renders on a mute toggle. Refreshing the timestamp on
    // every render would disarm it again and the cooldown would never end.
    show('dead')
    show('dead')
    expect(menuArmed()).toBe(true)
  })

  it('does not let a re-render extend a cooldown still in progress', () => {
    enter('dead')
    clock += ARM_MS - 50
    show('dead')
    clock += 50
    expect(menuArmed()).toBe(true)
  })

  it('restarts the clock when the mode changes from play to dead', () => {
    enter('dead')
    clock += ARM_MS
    expect(menuArmed()).toBe(true)
    show('play')
    show('dead')
    expect(menuArmed()).toBe(false)
  })
})
