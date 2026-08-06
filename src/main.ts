import './style.css'
import { Game, hasSave } from './core/game'
import { BoardRenderer } from './render/board'
import { renderReport, renderSidebar } from './ui/panels'
import { initOverlays, renderOverlay } from './ui/overlays'
import { bindInput } from './ui/input'
import { audio } from './audio'

function boot(): void {
  const app = document.getElementById('app')
  if (!app) throw new Error('#app missing')

  const left = document.createElement('div')
  left.id = 'left'
  left.className = 'panel'

  const wrap = document.createElement('div')
  wrap.id = 'board-wrap'
  const canvas = document.createElement('canvas')
  canvas.id = 'board'
  wrap.append(canvas)

  const right = document.createElement('div')
  right.id = 'right'
  right.className = 'panel'

  const overlay = document.createElement('div')
  overlay.id = 'overlay'

  app.append(left, wrap, right)
  document.body.append(overlay)

  const game = new Game()
  const board = new BoardRenderer(canvas)

  const refresh = (): void => {
    renderSidebar(game, left, i => { game.beginAim(i); refresh() }, mode => {
      game.mode = game.mode === mode ? 'play' : (mode as typeof game.mode)
      audio.play('ui_open')
      renderOverlay(game)
      refresh()
    })
    renderReport(game, right)
  }

  const resize = (): void => {
    board.layout(game, wrap.clientWidth, wrap.clientHeight)
  }

  game.onChange = () => {
    refresh()
    renderOverlay(game)
  }

  initOverlays({
    onStart: seed => {
      game.newRun(seed)
      game.mode = 'play'
      resize()
      renderOverlay(game)
      refresh()
      audio.resume()
    },
    canContinue: hasSave,
  })

  // Boot into a live run so the board renders behind the title screen.
  game.newRun()
  game.mode = 'title'
  resize()
  refresh()
  renderOverlay(game)
  bindInput(game, board, refresh)

  window.addEventListener('resize', () => { resize() })

  // Dev-only handle: lets the console (and the e2e harness) poke at real game
  // state instead of guessing pixel coordinates. Stripped from production.
  if (import.meta.env.DEV) {
    Reflect.set(window, '__rw3', { game, board, refresh, renderOverlay })
  }

  let last = performance.now()
  const frame = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    const wasBusy = game.fx.busy
    game.fx.tick(dt)
    if (wasBusy && !game.fx.busy) game.fx.prune()
    board.draw(game)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

boot()
