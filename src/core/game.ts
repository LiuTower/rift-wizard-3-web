import { RNG } from './rng'
import { COMPONENTS, COMPONENT_IDS, EQUIP_SLOTS, Tile, type ComponentId, type EquipSlot } from './types'
import { Level } from './level'
import { Unit } from './unit'
import { FxQueue } from './fx'
import { SpellInst, validTarget } from './spell'
import { moveToward, pickTarget, takeMonsterTurn } from './ai'
import { buildLevel, placePortals } from './levelgen'
import { makeRealm, makeRealmOptions, type RealmDef } from './realm'
import { getArtifact, getConsumable, getSpellDef, getUnitDef } from './registry'
import { emptyPouch, recomputeBonuses, type ArtifactDef, type ComponentPouch } from './crafting'
import { addConsumable, takeConsumable, type InventoryEntry } from './items'
import { applyBuff, dealDamage, healUnit, killUnit, removeBuff } from './combat'
import { makeBuff } from './buffs'
import { WIZARD_DEF } from '../content/wizard'
import { craftArtifact, equipArtifact } from './crafting'
import { enterStage, tutorialRevive, TUTORIAL_STEP_COUNT, type Tutorial, type TutorialAction } from './tutorial'

export type GameMode =
  | 'title' | 'play' | 'aim' | 'charsheet' | 'craft'
  | 'portal' | 'inventory' | 'help' | 'dead' | 'win' | 'menu' | 'tutorialEnd'

export interface LogLine { text: string; color: string; turn: number }

export interface TurnReport {
  headline: string
  headlineColor: string
  damage: Map<string, number>
  kills: Map<string, number>
  taken: number
  notes: string[]
}

export interface RunStats {
  damageDealt: number
  damageTaken: number
  killCount: number
  kills: Map<string, number>
  damageBySpell: Map<string, number>
  turns: number
  realmsCleared: number
  spellsCast: number
}

export interface RunState {
  seed: string
  realmIndex: number
  sp: number
  spSpent: number
  components: ComponentPouch
  equipment: Partial<Record<EquipSlot, ArtifactDef>>
  inventory: InventoryEntry[]
  realm: RealmDef
  nextOptions: RealmDef[]
  rerollUsed: boolean
  /** portals already offered, so a reroll cannot repeat them */
  turn: number
}

export interface AimState {
  kind: 'spell' | 'consumable'
  spellIdx: number
  consumableId?: string
  x: number
  y: number
}

const SP_PER_REALM = (difficulty: number): number =>
  difficulty <= 5 ? 3 : difficulty <= 12 ? 4 : 5

/**
 * Max HP gained per realm cleared. The original's wizard reaches roughly 250 HP
 * by the late realms; this curve lands around 230 before artifacts, which is what
 * keeps level 7-8 damage numbers survivable.
 */
const HP_PER_REALM = 9

export class Game {
  rng: RNG
  level!: Level
  player!: Unit
  run!: RunState
  fx = new FxQueue()
  mode: GameMode = 'title'
  aim?: AimState
  /** tile under the mouse, for tooltips */
  hover?: { x: number; y: number }
  logLines: LogLine[] = []
  report: TurnReport = emptyReport()
  stats: RunStats = emptyStats()
  /** UI redraw hook */
  onChange: () => void = () => {}
  /** set when the wizard dies or wins, for the summary screen */
  endMessage = ''
  /** last tutorial step announced in the log, to avoid repeats */
  private lastTutorialStep = -1
  /** non-undefined only during the scripted tutorial */
  tutorial?: Tutorial
  /** true once the wizard has used the extra action Haste grants this turn */
  private extraActionSpent = false
  private listeners = new Map<string, ((payload: unknown) => void)[]>()
  private flowCache = new Map<string, Int16Array>()
  private seedStr = ''

  constructor(seed?: string) {
    this.seedStr = seed ?? String(Date.now())
    this.rng = new RNG(this.seedStr)
  }

  // ---------------------------------------------------------------- lifecycle

  newRun(seed?: string): void {
    this.seedStr = seed ?? String(Date.now())
    this.rng = new RNG(this.seedStr)
    this.fx.clear()
    this.logLines = []
    this.stats = emptyStats()
    this.report = emptyReport()

    this.player = new Unit(WIZARD_DEF)
    this.player.isPlayer = true
    this.player.team = 'player'

    const realm = makeRealm(this.rng, 1)
    this.run = {
      seed: this.seedStr,
      realmIndex: 1,
      sp: 5,
      spSpent: 0,
      components: emptyPouch(),
      equipment: {},
      inventory: [],
      realm,
      nextOptions: [],
      rerollUsed: false,
      turn: 1,
    }
    // only hand out consumables the content layer actually registered
    for (const id of ['mana_potion', 'healing_potion']) {
      if (getConsumable(id)) addConsumable(this.run.inventory, id, 1)
    }
    this.enterRealm(realm)
    this.mode = 'play'
    this.log('你在裂隙中再次醒来。', '#c8c8d8')
    this.log('按 C 打开角色面板，学习法术。', '#8890a0')
    this.onChange()
  }

  enterRealm(realm: RealmDef): void {
    this.run.realm = realm
    this.run.realmIndex = realm.index
    this.run.rerollUsed = false
    this.run.turn = 1
    this.flowCache.clear()
    this.fx.clear()
    this.report = emptyReport()
    this.report.headline = `第 ${realm.index} 领域：${realm.biome.name}`

    for (const s of this.player.spells) s.charges = s.maxCharges
    // drop temporary minions and expiring enchantments between realms
    for (const b of this.player.buffs.slice()) {
      if (b.kind !== 'equip' && b.duration > 0) removeBuff(this, this.player, b.id)
    }
    this.player.dead = false

    this.level = buildLevel(this, realm)
    this.level.invalidateLOS()

    if (realm.index < 20) {
      this.run.nextOptions = makeRealmOptions(this.rng, realm.index + 1, 3)
      placePortals(this, this.run.nextOptions)
    } else {
      this.run.nextOptions = []
    }
    this.log(`—— 第 ${realm.index} 领域：${realm.biome.name} ——`, '#ffd84a')
    if (realm.boss) this.log('有什么庞然大物在此蠕动。', '#ff6a6a')
    this.saveRun()
  }

  /** Called by combat when the wizard's HP hits zero. */
  onPlayerDeath(): void {
    // The tutorial must never end in a death screen: the lesson would be lost
    // and the player would have to restart the whole script.
    if (this.tutorial && !this.tutorial.done) {
      this.player.dead = false
      tutorialRevive(this)
      this.onChange()
      return
    }
    this.mode = 'dead'
    this.endMessage = `巫师陨落于第 ${this.run.realmIndex} 领域。`
    clearSave()
    this.onChange()
  }

  win(): void {
    this.mode = 'win'
    this.endMessage = '莫德雷德已被终结。裂隙归于沉寂。'
    clearSave()
    this.onChange()
  }

  // ------------------------------------------------------------------- helpers

  makeUnit(defId: string): Unit | undefined {
    const def = getUnitDef(defId)
    if (!def) { console.warn(`unknown unit ${defId}`); return undefined }
    return new Unit(def)
  }

  applyPassives(u: Unit): void {
    for (const id of u.def?.passives ?? []) {
      const b = makeBuff(id, -1)
      if (b) { b.hidden = true; applyBuff(this, u, b) }
    }
  }

  /** Whole map is visible in this series, so log filtering is a no-op hook. */
  canSee(_u: Unit): boolean { return true }

  get enemies(): Unit[] { return this.level.units.filter(u => u.alive && u.team === 'enemy') }

  get cleared(): boolean { return this.enemies.length === 0 }

  /**
   * Tutorial gate. Outside the tutorial everything is permitted; inside, only
   * the current step's action is, and a refusal is logged so the player learns
   * why the click did nothing.
   */
  private tutorialAllows(a: TutorialAction): boolean {
    const t = this.tutorial
    if (!t || t.done || t.scripting) return true
    if (t.allows(a)) return true
    this.log(t.rejected, '#ffb03a')
    this.onChange()
    return false
  }

  /** Tell the tutorial an action landed, so it can advance. */
  private tutorialDid(a: TutorialAction): void {
    const t = this.tutorial
    if (!t || t.done || t.scripting) return
    t.notify(a)
  }

  /**
   * Is the player allowed to open `mode` right now? The tutorial pins the player
   * to the panel its current step needs; outside it, everything opens.
   */
  canOpenPanel(mode: GameMode): boolean {
    const t = this.tutorial
    if (!t || t.done) return true
    if (!t.allowsPanel(mode)) {
      this.log(t.rejected, '#ffb03a')
      return false
    }
    // Only an explicit "open this panel" step counts as progress; the escape
    // hatches and the panels a goal merely needs open do not.
    if (t.current?.goal.kind === 'panel' && t.current.goal.ref === mode) {
      t.notify({ kind: 'panel', ref: mode })
    }
    return true
  }

  /** The mouse moved onto a tile; the tutorial's examine step waits on this. */
  examined(x: number, y: number): void {
    const t = this.tutorial
    if (!t || t.done || t.scripting) return
    if (t.current?.goal.kind !== 'examine') return
    const want = t.highlight
    if (!want.some(p => p.x === x && p.y === y)) return
    t.notify({ kind: 'examine', at: { x, y } })
    this.onChange()
  }

  /** Forge an artifact by id. Single entry point so the tutorial can gate it. */
  craft(artifactId: string): boolean {
    const def = getArtifact(artifactId)
    if (!def) return false
    if (!this.tutorialAllows({ kind: 'craft', ref: artifactId })) return false
    if (!craftArtifact(this, def)) return false
    equipArtifact(this, def)
    this.log(`熔铸并装备了 ${def.name}。`, '#ffd84a')
    this.tutorialDid({ kind: 'craft', ref: artifactId })
    this.onChange()
    return true
  }

  flowTo(target: Unit, flying: boolean): Int16Array {
    const key = `${target.uid}:${flying ? 1 : 0}`
    const hit = this.flowCache.get(key)
    if (hit) return hit
    const field = this.level.flowField([{ x: target.x, y: target.y }], flying)
    this.flowCache.set(key, field)
    return field
  }

  log(text: string, color = '#c8c8d8'): void {
    this.logLines.push({ text, color, turn: this.run?.turn ?? 0 })
    if (this.logLines.length > 240) this.logLines.splice(0, this.logLines.length - 240)
  }

  recordDamage(sourceName: string, amount: number, fromPlayer: boolean): void {
    if (fromPlayer) {
      this.stats.damageDealt += amount
      this.stats.damageBySpell.set(sourceName, (this.stats.damageBySpell.get(sourceName) ?? 0) + amount)
      this.report.damage.set(sourceName, (this.report.damage.get(sourceName) ?? 0) + amount)
    } else {
      this.stats.damageTaken += amount
      this.report.taken += amount
    }
  }

  recordKill(name: string): void {
    this.stats.killCount++
    this.stats.kills.set(name, (this.stats.kills.get(name) ?? 0) + 1)
    this.report.kills.set(name, (this.report.kills.get(name) ?? 0) + 1)
  }

  on(evt: string, cb: (payload: unknown) => void): void {
    const list = this.listeners.get(evt) ?? []
    list.push(cb)
    this.listeners.set(evt, list)
  }

  emit(evt: string, payload: unknown): void {
    for (const cb of this.listeners.get(evt) ?? []) cb(payload)
  }

  /** Chance for a slain monster to leave a crafting component behind. */
  rollDrop(u: Unit): void {
    const boss = u.hasTag('boss')
    const chance = boss ? 1 : 0.06 + u.level * 0.02
    const count = boss ? 3 : 1
    if (!this.rng.chance(chance)) return
    for (let i = 0; i < count; i++) {
      const ids: ComponentId[] = ['U', 'T', 'C', 'H', 'B', 'I', 'S', 'O']
      const id = this.rng.pick(ids)
      this.giveComponent(id, 1)
    }
  }

  giveComponent(id: ComponentId, n: number): void {
    this.run.components[id] += n
    this.report.notes.push(`${COMPONENTS[id].name} +${n}`)
  }

  // -------------------------------------------------------------- player turn

  /** Wizard spellbook, in learn order. */
  get spells(): SpellInst[] { return this.player.spells }

  learnSpell(defId: string): boolean {
    const def = getSpellDef(defId)
    if (!def) return false
    if (this.player.spells.some(s => s.id === defId)) return false
    if (this.run.sp < def.level) return false
    if (!this.tutorialAllows({ kind: 'learn', ref: defId })) return false
    this.run.sp -= def.level
    this.run.spSpent += def.level
    const inst = new SpellInst(def, this.player)
    this.player.spells.push(inst)
    this.log(`习得 ${def.name}。`, '#9ad0ff')
    this.tutorialDid({ kind: 'learn', ref: defId })
    this.onChange()
    return true
  }

  buyUpgrade(spellId: string, upgradeId: string): boolean {
    const s = this.player.spells.find(sp => sp.id === spellId)
    if (!s) return false
    if (s.upgradePicksLeft <= 0) return false
    if (s.hasUpgrade(upgradeId)) return false
    const up = s.def.upgrades.find(u => u.id === upgradeId)
    if (!up) return false
    const cost = up.cost ?? s.def.level
    if (this.run.sp < cost) return false
    if (!this.tutorialAllows({ kind: 'upgrade', ref: spellId, ref2: upgradeId })) return false
    this.run.sp -= cost
    this.run.spSpent += cost
    s.upgradesTaken.push(upgradeId)
    if (s.charges > s.maxCharges) s.charges = s.maxCharges
    this.log(`${s.name}：${up.name}。`, '#9ad0ff')
    this.tutorialDid({ kind: 'upgrade', ref: spellId, ref2: upgradeId })
    this.onChange()
    return true
  }

  canCast(idx: number): boolean {
    const s = this.player.spells[idx]
    if (!s) return false
    if (s.charges <= 0) return false
    if (s.hpCost >= this.player.hp) return false
    if (this.player.blinded && s.def.target !== 'self') return false
    return true
  }

  beginAim(idx: number): boolean {
    const s = this.player.spells[idx]
    if (!s || !this.canCast(idx)) return false
    // Refuse at selection time, not after the player has aimed and clicked: the
    // nudge is only useful before they commit to a target.
    if (!this.tutorialAllows({ kind: 'cast', ref: s.id })) return false
    if (s.def.target === 'self') return this.castSpell(idx, this.player.x, this.player.y)
    this.aim = { kind: 'spell', spellIdx: idx, x: this.player.x, y: this.player.y }
    this.mode = 'aim'
    this.onChange()
    return true
  }

  beginAimConsumable(id: string): boolean {
    const def = getConsumable(id)
    if (!def) return false
    if (!def.target || def.target === 'none') return this.useConsumable(id, this.player.x, this.player.y)
    this.aim = { kind: 'consumable', spellIdx: -1, consumableId: id, x: this.player.x, y: this.player.y }
    this.mode = 'aim'
    this.onChange()
    return true
  }

  cancelAim(): void {
    this.aim = undefined
    if (this.mode === 'aim') this.mode = 'play'
    this.onChange()
  }

  targetValid(x: number, y: number): boolean {
    if (!this.aim) return false
    if (this.aim.kind === 'spell') {
      const s = this.player.spells[this.aim.spellIdx]
      return !!s && validTarget(s, this, x, y)
    }
    const def = getConsumable(this.aim.consumableId ?? '')
    if (!def) return false
    if (!this.level.inBounds(x, y)) return false
    const r = def.range ?? 8
    if (Math.hypot(x - this.player.x, y - this.player.y) > r + 0.001) return false
    if ((def.requiresLOS ?? true) && !this.level.hasLOS(this.player.x, this.player.y, x, y)) return false
    if (def.target === 'enemy') {
      const u = this.level.unitAt(x, y)
      if (!u || u.team === 'player') return false
    }
    return true
  }

  confirmAim(x: number, y: number): boolean {
    if (!this.aim) return false
    if (!this.targetValid(x, y)) return false
    if (this.aim.kind === 'spell') return this.castSpell(this.aim.spellIdx, x, y)
    const id = this.aim.consumableId
    return id ? this.useConsumable(id, x, y) : false
  }

  castSpell(idx: number, x: number, y: number): boolean {
    const s = this.player.spells[idx]
    if (!s || !this.canCast(idx)) return false
    if (!validTarget(s, this, x, y)) return false
    if (!this.tutorialAllows({ kind: 'cast', ref: s.id, at: { x, y } })) return false

    this.aim = undefined
    this.mode = 'play'
    this.startReport(`你施放了 ${s.name}`, s.def.color ?? '#ffffff')
    this.breakChannel(s)

    s.charges--
    if (s.hpCost > 0) {
      dealDamage(this, this.player, s.hpCost, 'physical')
      this.report.notes.push(`支付 ${s.hpCost} 生命`)
    }
    this.stats.spellsCast++
    s.def.cast(s, this, x, y)
    for (const b of this.player.buffs.slice()) b.onCast?.(this.player, this, s, x, y)
    this.emit('cast', { spell: s, x, y })

    if (s.def.channel && s.def.channel > 1) {
      s.channelTurns = s.def.channel - 1
      s.channelTarget = { x, y }
      const b = makeBuff('channeling', s.channelTurns)
      if (b) applyBuff(this, this.player, b)
      this.report.headline = `你正在引导 ${s.name}`
    }

    this.tutorialDid({ kind: 'cast', ref: s.id, at: { x, y } })
    this.endPlayerTurn()
    return true
  }

  /** Repeat the channeled spell without spending a charge. */
  continueChannel(): boolean {
    const s = this.player.spells.find(sp => sp.channelTurns > 0 && sp.channelTarget)
    if (!s || !s.channelTarget) return false
    this.startReport(`你正在引导 ${s.name}`, s.def.color ?? '#ffffff')
    s.channelTurns--
    s.def.cast(s, this, s.channelTarget.x, s.channelTarget.y)
    if (s.channelTurns <= 0) {
      s.channelTarget = undefined
      removeBuff(this, this.player, 'channeling')
    }
    this.endPlayerTurn()
    return true
  }

  private breakChannel(except?: SpellInst): void {
    for (const s of this.player.spells) {
      if (s === except) continue
      if (s.channelTurns > 0) {
        s.channelTurns = 0
        s.channelTarget = undefined
        removeBuff(this, this.player, 'channeling')
      }
    }
  }

  get channeling(): SpellInst | undefined {
    return this.player.spells.find(s => s.channelTurns > 0)
  }

  useConsumable(id: string, x: number, y: number): boolean {
    const def = getConsumable(id)
    if (!def) return false
    if (!this.run.inventory.some(e => e.id === id && e.count > 0)) return false
    if (!this.tutorialAllows({ kind: 'consumable', ref: id })) return false
    this.aim = undefined
    if (this.mode === 'aim' || this.mode === 'inventory') this.mode = 'play'
    this.startReport(`你使用了 ${def.name}`, def.color)
    this.breakChannel()
    if (!def.use(this, x, y)) return false
    takeConsumable(this.run.inventory, id)
    this.tutorialDid({ kind: 'consumable', ref: id })
    this.endPlayerTurn()
    return true
  }

  movePlayer(dx: number, dy: number): boolean {
    const nx = this.player.x + dx, ny = this.player.y + dy
    if (!this.level.inBounds(nx, ny)) return false
    if (!this.level.passable(nx, ny, this.player.flying)) return false
    const other = this.level.unitAt(nx, ny)
    if (other && other.team !== 'player') return false
    if (!this.tutorialAllows({ kind: 'move', at: { x: nx, y: ny } })) return false
    this.startReport('', '#c8c8d8')
    this.breakChannel()
    const px = this.player.x, py = this.player.y
    if (other) {
      // swap with your own minion — both bodies slide, or the minion teleports
      this.level.placeUnit(other, px, py)
      this.level.placeUnit(this.player, nx, ny)
      this.fx.move(other.uid, nx, ny, px, py)
    } else {
      this.level.placeUnit(this.player, nx, ny)
    }
    this.fx.move(this.player.uid, px, py, nx, ny)
    this.level.invalidateLOS()
    for (const b of this.player.buffs.slice()) b.onMove?.(this.player, this, this.player.x - dx, this.player.y - dy)
    this.checkTileEffects(this.player)
    this.tutorialDid({ kind: 'move', at: { x: this.player.x, y: this.player.y } })
    if (this.player.alive) this.endPlayerTurn()
    return true
  }

  passTurn(): boolean {
    if (this.channeling) return this.continueChannel()
    if (!this.tutorialAllows({ kind: 'wait' })) return false
    this.startReport('你原地等待。', '#8890a0')
    this.tutorialDid({ kind: 'wait' })
    this.endPlayerTurn()
    return true
  }

  /** Walk into a portal to leave a cleared realm. */
  tryTakePortal(): boolean {
    const portal = this.level.portalAt(this.player.x, this.player.y)
    if (!portal) return false
    if (!this.cleared) {
      this.log('敌人尚存，传送门不会开启。', '#ff9a9a')
      return false
    }
    if (!this.tutorialAllows({ kind: 'portal' })) return false

    // The tutorial's second stage is hand-built, not a generated realm.
    const t = this.tutorial
    if (t) {
      this.tutorialDid({ kind: 'portal' })
      enterStage(this, t, 1)
      return true
    }
    const gain = SP_PER_REALM(this.run.realm.difficulty)
    this.run.sp += gain
    this.stats.realmsCleared++
    // The wizard toughens with every rift survived; without this the HP curve
    // stays flat while monster damage triples, which is unwinnable by realm 8.
    this.player.maxHP += HP_PER_REALM
    this.player.hp += HP_PER_REALM
    const mend = Math.round(this.player.effectiveMaxHP * 0.2)
    healUnit(this, this.player, mend)
    this.log(`领域已清空。+${gain} SP，生命上限 +${HP_PER_REALM}，恢复 ${mend} 点生命。`, '#ffd84a')
    this.enterRealm(portal.realm)
    this.mode = 'play'
    this.onChange()
    return true
  }

  rerollPortals(): boolean {
    if (this.run.rerollUsed) return false
    if (this.run.realmIndex >= 20) return false
    this.run.rerollUsed = true
    this.run.nextOptions = makeRealmOptions(this.rng, this.run.realmIndex + 1, 3)
    placePortals(this, this.run.nextOptions)
    this.log('裂隙翻涌，重新成形。', '#c0a0ff')
    this.onChange()
    return true
  }

  /**
   * Open a fresh turn report. Every player action funnels through here, which is
   * also where the animation timeline gets rebased — see `FxQueue.catchUp`.
   */
  private startReport(headline: string, color: string): void {
    this.report = emptyReport()
    this.report.headline = headline
    this.report.headlineColor = color
    this.fx.catchUp()
  }

  /** Terrain and pickups after any move or teleport. */
  checkTileEffects(u: Unit): void {
    if (!u.alive) return
    if (this.level.get(u.x, u.y) === Tile.Chasm && !u.flying) {
      this.log(`${u.name} 坠入深渊。`, '#a05ad0')
      killUnit(this, u)
      return
    }
    if (!u.isPlayer) return
    const item = this.level.itemAt(u.x, u.y)
    if (item) this.pickUp(item.x, item.y)
  }

  pickUp(x: number, y: number): void {
    const item = this.level.itemAt(x, y)
    if (!item) return
    if (item.kind === 'component') {
      this.giveComponent(item.ref as ComponentId, item.count ?? 1)
      this.log(`拾取 ${item.name}${(item.count ?? 1) > 1 ? ` ×${item.count}` : ''}。`, item.color)
      this.level.removeItem(x, y)
    } else if (item.kind === 'consumable') {
      if (addConsumable(this.run.inventory, item.ref, 1)) {
        this.log(`拾取 ${item.name}。`, item.color)
        this.level.removeItem(x, y)
      } else {
        this.log('你的行囊已满。', '#ff9a9a')
      }
    } else if (item.kind === 'shrine') {
      this.run.sp += 1
      this.log('神龛赐予你一点技能点。', '#ffd84a')
      this.level.removeItem(x, y)
    }
    this.onChange()
  }

  // --------------------------------------------------------------- turn cycle

  endPlayerTurn(): void {
    // Haste gives the wizard a second action before the world moves.
    if (this.player.hasBuff('hasted') && !this.extraActionSpent && this.player.alive) {
      this.extraActionSpent = true
      this.fx.beat()
      this.log('急速让你获得额外行动。', '#ffe019')
      this.onChange()
      return
    }
    this.extraActionSpent = false
    this.flowCache.clear()
    this.fx.beat()
    this.endUnitTurn(this.player)
    if (!this.player.alive) return

    // player minions first, then enemies — deterministic order by uid
    const actors = this.level.units.filter(u => u.alive && !u.isPlayer)
    actors.sort((a, b) => (a.team === b.team ? a.uid - b.uid : a.team === 'player' ? -1 : 1))
    for (const u of actors) {
      if (!u.alive) continue
      if (!this.player.alive) break
      const acted = takeMonsterTurn(this, u)
      if (!u.alive) { this.fx.beat(); continue }
      // Hasted acts twice; Swift only gets a second step, so fast skirmishers
      // close distance without doubling their damage.
      if (u.hasBuff('hasted')) takeMonsterTurn(this, u)
      else if (u.hasBuff('swift') && acted !== 'attack') {
        const target = pickTarget(this, u)
        if (target && !u.stationary && !u.rooted) moveToward(this, u, target)
      }
      this.endUnitTurn(u)
      this.fx.beat()
    }

    this.tickClouds()
    this.run.turn++
    this.stats.turns++
    this.flowCache.clear()

    if (this.cleared && this.run.realmIndex >= 20 && this.mode === 'play' && !this.tutorial) this.win()
    // A step that waits on "all enemies dead" completes during the enemy phase.
    if (this.tutorial && !this.tutorial.done) this.tutorial.check()
    this.onChange()
  }

  /** Buff ticks, expiry and summon timers for one unit. */
  private endUnitTurn(u: Unit): void {
    if (!u.alive) return
    u.turnsAlive++
    for (const b of u.buffs.slice()) b.onTurnEnd?.(u, this)
    if (!u.alive) return
    for (const b of u.buffs.slice()) {
      if (b.duration > 0) {
        b.duration--
        if (b.duration === 0) removeBuff(this, u, b.id)
      }
    }
    if (u.summonTurns > 0) {
      u.summonTurns--
      if (u.summonTurns === 0) {
        this.fx.death(u.x, u.y, u.color)
        this.level.removeUnit(u)
        u.dead = true
      }
    }
  }

  private tickClouds(): void {
    const lvl = this.level
    for (let i = 0; i < lvl.clouds.length; i++) {
      const c = lvl.clouds[i]
      if (!c) continue
      const u = lvl.unitAt(c.x, c.y)
      if (u?.alive && c.friendly !== u.team) {
        if (c.damage > 0) dealDamage(this, u, c.damage, c.damageType)
        c.onStand?.(u, this)
      }
      c.duration--
      if (c.duration <= 0) lvl.removeCloud(c.x, c.y)
    }
  }

  // ------------------------------------------------------------------ persist

  saveRun(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(serializeRun(this)))
    } catch { /* storage unavailable, run stays in memory */ }
  }

  loadRun(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (!raw) return false
      const blob = parseSave(JSON.parse(raw))
      return blob ? deserializeRun(this, blob) : false
    } catch {
      return false
    }
  }
}

function emptyStats(): RunStats {
  return {
    damageDealt: 0, damageTaken: 0, killCount: 0,
    kills: new Map(), damageBySpell: new Map(),
    turns: 0, realmsCleared: 0, spellsCast: 0,
  }
}

export function emptyReport(): TurnReport {
  return { headline: '', headlineColor: '#c8c8d8', damage: new Map(), kills: new Map(), taken: 0, notes: [] }
}

// ------------------------------------------------------------------- save/load

const SAVE_KEY = 'rw3web.save.v1'

interface SaveBlob {
  seed: string
  realmIndex: number
  sp: number
  spSpent: number
  hp: number
  maxHP: number
  components: ComponentPouch
  equipment: string[]
  inventory: InventoryEntry[]
  spells: { id: string; upgrades: string[] }[]
  realmSeed: number
  realmBiome: string
  stats: { kills: number; damage: number; turns: number; realms: number }
}

function serializeRun(g: Game): SaveBlob {
  return {
    seed: g.run.seed,
    realmIndex: g.run.realmIndex,
    sp: g.run.sp,
    spSpent: g.run.spSpent,
    hp: g.player.hp,
    maxHP: g.player.maxHP,
    components: { ...g.run.components },
    equipment: EQUIP_SLOTS.flatMap(slot => {
      const art = g.run.equipment[slot]
      return art ? [art.id] : []
    }),
    inventory: g.run.inventory.map(e => ({ ...e })),
    spells: g.player.spells.map(s => ({ id: s.id, upgrades: s.upgradesTaken.slice() })),
    realmSeed: g.run.realm.seed,
    realmBiome: g.run.realm.biome.id,
    stats: {
      kills: g.stats.killCount, damage: g.stats.damageDealt,
      turns: g.stats.turns, realms: g.stats.realmsCleared,
    },
  }
}

function deserializeRun(g: Game, blob: SaveBlob): boolean {
  // Rebuild the run, then regenerate the realm the wizard was in.
  g.newRun(blob.seed)
  g.run.sp = blob.sp
  g.run.spSpent = blob.spSpent
  g.run.components = { ...blob.components }
  g.run.inventory = blob.inventory.map(e => ({ ...e }))
  g.player.spells = []
  for (const s of blob.spells) {
    const def = getSpellDef(s.id)
    if (!def) continue
    const inst = new SpellInst(def, g.player)
    inst.upgradesTaken = s.upgrades.filter(u => def.upgrades.some(d => d.id === u)).slice(0, 2)
    g.player.spells.push(inst)
  }
  for (const id of blob.equipment) {
    const art = getArtifact(id)
    if (art) g.run.equipment[art.slot] = art
  }
  recomputeBonuses(g)
  g.player.maxHP = blob.maxHP
  g.stats.killCount = blob.stats.kills
  g.stats.damageDealt = blob.stats.damage
  g.stats.turns = blob.stats.turns
  g.stats.realmsCleared = blob.stats.realms

  const realm = makeRealm(new RNG(blob.realmSeed), blob.realmIndex)
  realm.seed = blob.realmSeed
  g.enterRealm(realm)
  g.player.hp = Math.max(1, Math.min(blob.hp, g.player.effectiveMaxHP))
  g.mode = 'play'
  g.log('进度已恢复。', '#8890a0')
  g.onChange()
  return true
}

/**
 * Saves come from localStorage, i.e. outside our control. Validate the shape
 * before trusting it; a partially-written or stale blob just means "no save".
 */
function parseSave(raw: unknown): SaveBlob | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o: Record<string, unknown> = raw as Record<string, unknown>
  const num = (v: unknown, fallback = 0): number => typeof v === 'number' && Number.isFinite(v) ? v : fallback
  if (typeof o.seed !== 'string') return undefined
  if (typeof o.realmIndex !== 'number' || typeof o.realmSeed !== 'number') return undefined
  const pouch = emptyPouch()
  if (o.components && typeof o.components === 'object') {
    for (const id of COMPONENT_IDS) {
      pouch[id] = Math.max(0, Math.floor(num((o.components as Record<string, unknown>)[id])))
    }
  }
  const spells: { id: string; upgrades: string[] }[] = []
  if (Array.isArray(o.spells)) {
    for (const entry of o.spells) {
      if (!entry || typeof entry !== 'object') continue
      const e: Record<string, unknown> = entry as Record<string, unknown>
      if (typeof e.id !== 'string') continue
      const ups = Array.isArray(e.upgrades) ? e.upgrades.filter((u): u is string => typeof u === 'string') : []
      spells.push({ id: e.id, upgrades: ups })
    }
  }
  const inventory: InventoryEntry[] = []
  if (Array.isArray(o.inventory)) {
    for (const entry of o.inventory) {
      if (!entry || typeof entry !== 'object') continue
      const e: Record<string, unknown> = entry as Record<string, unknown>
      if (typeof e.id !== 'string') continue
      inventory.push({ id: e.id, count: Math.max(1, Math.floor(num(e.count, 1))) })
    }
  }
  const statsRaw: Record<string, unknown> = (o.stats && typeof o.stats === 'object' ? o.stats : {}) as Record<string, unknown>
  return {
    seed: o.seed,
    realmIndex: Math.max(1, Math.min(20, Math.floor(o.realmIndex))),
    sp: Math.max(0, Math.floor(num(o.sp))),
    spSpent: Math.max(0, Math.floor(num(o.spSpent))),
    hp: Math.max(1, Math.floor(num(o.hp, 1))),
    maxHP: Math.max(1, Math.floor(num(o.maxHP, 60))),
    components: pouch,
    equipment: Array.isArray(o.equipment) ? o.equipment.filter((e): e is string => typeof e === 'string') : [],
    inventory,
    spells,
    realmSeed: Math.floor(o.realmSeed),
    realmBiome: typeof o.realmBiome === 'string' ? o.realmBiome : 'stone',
    stats: {
      kills: num(statsRaw.kills), damage: num(statsRaw.damage),
      turns: num(statsRaw.turns), realms: num(statsRaw.realms),
    },
  }
}

export function hasSave(): boolean {
  try { return !!localStorage.getItem(SAVE_KEY) } catch { return false }
}

export function clearSave(): void {
  try { localStorage.removeItem(SAVE_KEY) } catch { /* ignore */ }
}
