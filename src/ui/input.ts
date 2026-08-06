import type { Game } from '../core/game'
import type { BoardRenderer } from '../render/board'
import { renderOverlay } from './overlays'
import { hideTooltip } from './panels'
import { audio } from '../audio'
import { cheb } from '../core/geom'

const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  // diagonals sit on q/e/z/x so they never shadow the panel hotkeys (C/F/P/I/H)
  q: [-1, -1], e: [1, -1], z: [-1, 1], x: [1, 1],
  Numpad8: [0, -1], Numpad2: [0, 1], Numpad4: [-1, 0], Numpad6: [1, 0],
  Numpad7: [-1, -1], Numpad9: [1, -1], Numpad1: [-1, 1], Numpad3: [1, 1],
}

const PANEL_KEYS: Record<string, string> = {
  C: 'charsheet', F: 'craft', P: 'portal', H: 'help', I: 'inventory',
}

export function bindInput(g: Game, board: BoardRenderer, refresh: () => void): void {
  const canvas = board.canvas

  const act = (didSomething: boolean) => {
    if (didSomething) refresh()
    else audio.play('ui_error')
  }

  window.addEventListener('keydown', ev => {
    audio.resume()
    if (ev.key === 'Control') { g.fx.skip(); return }

    // full-screen panels: only closing keys and panel switches
    if (g.mode !== 'play' && g.mode !== 'aim') {
      if (g.mode === 'title' || g.mode === 'dead' || g.mode === 'win') return
      if (ev.key === 'Escape') {
        g.mode = 'play'
        renderOverlay(g)
        refresh()
        ev.preventDefault()
        return
      }
      const upper = ev.key.toUpperCase()
      if (PANEL_KEYS[upper]) {
        const next = PANEL_KEYS[upper]
        g.mode = g.mode === next ? 'play' : (next as typeof g.mode)
        audio.play('ui_open')
        renderOverlay(g)
        refresh()
        ev.preventDefault()
        return
      }
      if (upper === 'R' && g.mode === 'portal') { g.rerollPortals(); renderOverlay(g); ev.preventDefault() }
      if (upper === 'M') { audio.setMuted(!audio.muted); renderOverlay(g); ev.preventDefault() }
      return
    }

    // spell hotkeys work in both play and aim mode
    if (/^[1-9]$/.test(ev.key)) {
      const idx = Number(ev.key) - 1
      if (idx < g.player.spells.length) {
        audio.play('ui_click')
        act(g.beginAim(idx))
      }
      ev.preventDefault()
      return
    }

    if (g.mode === 'aim' && g.aim) {
      const mv = MOVE_KEYS[ev.code] ?? MOVE_KEYS[ev.key]
      if (mv) {
        g.aim.x = Math.max(0, Math.min(g.level.w - 1, g.aim.x + mv[0]))
        g.aim.y = Math.max(0, Math.min(g.level.h - 1, g.aim.y + mv[1]))
        g.hover = { x: g.aim.x, y: g.aim.y }
        refresh()
        ev.preventDefault()
        return
      }
      if (ev.key === 'Enter' || ev.key === ' ') {
        act(g.confirmAim(g.aim.x, g.aim.y))
        ev.preventDefault()
        return
      }
      if (ev.key === 'Escape') { g.cancelAim(); refresh(); ev.preventDefault(); return }
      if (ev.key === 'Tab') {
        // cycle to the next hostile in range
        const targets = g.enemies
          .filter(u => g.targetValid(u.x, u.y))
          .sort((a, b) => cheb(g.player.x, g.player.y, a.x, a.y) - cheb(g.player.x, g.player.y, b.x, b.y))
        if (targets.length) {
          const cur = targets.findIndex(u => u.x === g.aim?.x && u.y === g.aim?.y)
          const next = targets[(cur + 1) % targets.length]
          g.aim.x = next.x; g.aim.y = next.y
          g.hover = { x: next.x, y: next.y }
          refresh()
        }
        ev.preventDefault()
        return
      }
    }

    const mv = MOVE_KEYS[ev.code] ?? MOVE_KEYS[ev.key]
    if (mv) {
      audio.play('move', { volume: 0.5 })
      act(g.movePlayer(mv[0], mv[1]))
      ev.preventDefault()
      return
    }

    if (ev.key === ' ' || ev.key === '.') { act(g.passTurn()); ev.preventDefault(); return }
    if (ev.key === 'Enter') {
      if (g.level.portalAt(g.player.x, g.player.y)) { act(g.tryTakePortal()); audio.play('portal') }
      ev.preventDefault()
      return
    }
    if (ev.key === 'Escape') {
      g.mode = 'menu'
      audio.play('ui_open')
      renderOverlay(g)
      ev.preventDefault()
      return
    }

    const upper = ev.key.toUpperCase()
    if (PANEL_KEYS[upper]) {
      g.mode = PANEL_KEYS[upper] as typeof g.mode
      audio.play('ui_open')
      renderOverlay(g)
      refresh()
      ev.preventDefault()
      return
    }
    if (upper === 'R') { act(g.rerollPortals()); return }
    if (upper === 'M') { audio.setMuted(!audio.muted); refresh(); return }
  })

  canvas.addEventListener('mousemove', ev => {
    const t = board.tileAt(ev.clientX, ev.clientY)
    if (!t || !g.level.inBounds(t.x, t.y)) {
      if (g.hover) { g.hover = undefined; refresh() }
      return
    }
    if (g.hover && g.hover.x === t.x && g.hover.y === t.y) return
    g.hover = t
    if (g.mode === 'aim' && g.aim) { g.aim.x = t.x; g.aim.y = t.y }
    refresh()
  })

  canvas.addEventListener('mouseleave', () => {
    if (g.hover) { g.hover = undefined; refresh() }
    hideTooltip()
  })

  canvas.addEventListener('contextmenu', ev => {
    ev.preventDefault()
    if (g.mode === 'aim') { g.cancelAim(); refresh() }
  })

  canvas.addEventListener('mousedown', ev => {
    audio.resume()
    if (ev.button !== 0) return
    const t = board.tileAt(ev.clientX, ev.clientY)
    if (!t || !g.level.inBounds(t.x, t.y)) return

    if (g.mode === 'aim') {
      act(g.confirmAim(t.x, t.y))
      return
    }
    if (g.mode !== 'play') return

    if (t.x === g.player.x && t.y === g.player.y) {
      if (g.level.portalAt(t.x, t.y)) { act(g.tryTakePortal()); audio.play('portal') }
      else act(g.passTurn())
      return
    }
    if (cheb(g.player.x, g.player.y, t.x, t.y) === 1) {
      audio.play('move', { volume: 0.5 })
      act(g.movePlayer(t.x - g.player.x, t.y - g.player.y))
    }
  })
}
