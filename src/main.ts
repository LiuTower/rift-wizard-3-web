import './style.css'
import { Game, hasSave } from './core/game'
import { BoardRenderer } from './render/board'
import { renderReport, renderSidebar, renderTutorialBanner } from './ui/panels'
import { initOverlays, renderOverlay } from './ui/overlays'
import { bindInput } from './ui/input'
import { startTutorial } from './core/tutorial'
import { audio } from './audio'

/** Board space given to the tutorial banner; mirrors `#board-wrap.tut` padding. */
const TUTORIAL_RESERVE = 160

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
  const banner = document.createElement('div')
  banner.id = 'tutorial'
  wrap.append(canvas, banner)

  const right = document.createElement('div')
  right.id = 'right'
  right.className = 'panel'

  const overlay = document.createElement('div')
  overlay.id = 'overlay'

  app.append(left, wrap, right)
  document.body.append(overlay)

  const game = new Game()
  const board = new BoardRenderer(canvas)

  /** True while the board column is reserving space for the tutorial banner. */
  let reserved = false

  const refresh = (): void => {
    renderSidebar(game, left, i => { game.beginAim(i); refresh() }, mode => {
      const next = game.mode === mode ? 'play' : (mode as typeof game.mode)
      if (!game.canOpenPanel(next)) { audio.play('ui_error'); renderReport(game, right); return }
      game.mode = next
      audio.play('ui_open')
      renderOverlay(game)
      refresh()
    })
    renderReport(game, right)
    renderTutorialBanner(game, banner)

    // Re-layout only when the tutorial starts or ends: doing it per step would
    // make the board jump every time the instructions change length.
    const want = !!game.tutorial && !game.tutorial.done
    if (want !== reserved) {
      reserved = want
      wrap.classList.toggle('tut', want)
      resize()
    }
  }

  const resize = (): void => {
    // Fixed reserve, matching `#board-wrap.tut`'s padding: measuring the banner
    // here races the first layout pass, where the column has no width yet and the
    // text wraps into a comically tall block.
    board.layout(game, wrap.clientWidth, wrap.clientHeight - (reserved ? TUTORIAL_RESERVE : 0))
  }

  game.onChange = () => {
    refresh()
    renderOverlay(game)
  }

  initOverlays({
    onStart: seed => {
      game.tutorial = undefined
      game.persist = true
      game.newRun(seed)
      // Seed storage from the call site instead of leaning on `enterRealm`'s
      // internal write, so a player who closes the tab immediately still has a run.
      game.saveRun()
      game.mode = 'play'
      resize()
      renderOverlay(game)
      refresh()
      audio.resume()
    },
    onTutorial: () => {
      startTutorial(game)
      resize()
      renderOverlay(game)
      refresh()
      audio.resume()
    },
    canContinue: hasSave,
  })

  // Boot into a live run so the board renders behind the title screen. It stays
  // unpersisted on purpose: this run is scenery, and writing it would erase the
  // player's actual save on every page load.
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
