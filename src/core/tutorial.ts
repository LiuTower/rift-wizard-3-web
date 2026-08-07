import type { Game, GameMode } from './game'
import { emptyReport } from './game'
import type { Point } from './types'
import type { RealmDef } from './realm'
import { Tile } from './types'
import { Level } from './level'
import { BIOMES } from './realm'
import { applyBuff } from './combat'
import { makeBuff } from './buffs'
import { getArtifact } from './registry'
import { LEVEL_H, LEVEL_W } from './levelgen'

/**
 * Scripted tutorial.
 *
 * Two hand-built realms teach the whole game. The flow is fixed: each step
 * declares the single thing the player is allowed to do, so nobody can wander
 * off and get stuck wondering why nothing works. Gating lives in `Game` rather
 * than the UI because actions arrive from three places (keyboard, board clicks,
 * overlay clicks) and a UI-side gate would leak.
 */

// --------------------------------------------------------------------- actions

export type TutorialGoalKind =
  | 'move' | 'examine' | 'cast' | 'wait' | 'panel'
  | 'learn' | 'upgrade' | 'craft' | 'consumable' | 'preview' | 'portal'

/** What the player just did, or is trying to do. */
export interface TutorialAction {
  kind: TutorialGoalKind
  /** target tile for move / examine / cast */
  at?: Point
  /** spell id, consumable id, artifact id, or panel mode */
  ref?: string
  /** upgrade id, when `ref` is the spell it belongs to */
  ref2?: string
}

export interface TutorialGoal {
  kind: TutorialGoalKind
  /** mark letter on the stage map, resolved to a tile */
  mark?: string
  /** spell / consumable / artifact id, or panel mode */
  ref?: string
  ref2?: string
}

export interface TutorialStep {
  /** stage index: 0 = first realm, 1 = second */
  stage: 0 | 1
  title: string
  /** instruction paragraphs shown in the tutorial panel */
  body: string[]
  goal: TutorialGoal
  /** stage dressing applied when the step opens */
  setup?: (t: Tutorial) => void
  /** completion test; defaults to "the goal action succeeded once" */
  until?: (g: Game) => boolean
}

// ------------------------------------------------------------------ stage maps

/**
 * `#` wall · `.` floor · `~` chasm · `@` start · anything else is a named mark
 * that the script targets, so the maps can be reshaped without touching steps.
 */
const STAGE_MAPS: readonly (readonly string[])[] = [
  [
    '############################',
    '#....#....##########.......#',
    '#..a.#..b.#........#...d...#',
    '#....#....#...ee...#.......#',
    '#..@.+.x..+...ee...+..w....#',
    '#....#....#........#...c...#',
    '#....#....##########.......#',
    '####+#############+#########',
    '#..........................#',
    '#..f....g........h....i....#',
    '#..........................#',
    '#####+###############+######',
    '#........#~~~~~~~~~~#......#',
    '#...j....#~~~~~~~~~~#..k...#',
    '#........#~~~~~~~~~~#......#',
    '#........#~~~~~~~~~~#......#',
    '#........############......#',
    '#...l.........m........n...#',
    '#..........................#',
    '#....o................p....#',
    '############################',
  ],
  [
    '############################',
    '#..........................#',
    '#...a..........b...........#',
    '#.........########.........#',
    '#....@....#......#....c....#',
    '#.........#..dd..#.........#',
    '#....e....#..dd..#....f....#',
    '#.........#......#.........#',
    '#.........###..###.........#',
    '#..........................#',
    '#...g..........h.......i...#',
    '#..........................#',
    '#####.############.....#####',
    '#........#.........#.......#',
    '#...j....#....k....#...l...#',
    '#........#.........#.......#',
    '#........#.........#.......#',
    '#...m....#....n....#...o...#',
    '#........#.........#.......#',
    '#...p..........q.......r...#',
    '############################',
  ],
]

const STAGE_BIOMES = ['stone', 'crypt']

interface ParsedMap {
  tiles: Uint8Array
  start: Point
  marks: Record<string, Point[]>
}

function parseMap(rows: readonly string[]): ParsedMap {
  const tiles = new Uint8Array(LEVEL_W * LEVEL_H).fill(Tile.Wall)
  const marks: Record<string, Point[]> = {}
  let start: Point = { x: 1, y: 1 }
  for (let y = 0; y < LEVEL_H; y++) {
    const row = rows[y] ?? ''
    for (let x = 0; x < LEVEL_W; x++) {
      const ch = row[x] ?? '#'
      if (ch === '#') continue
      tiles[y * LEVEL_W + x] = ch === '~' ? Tile.Chasm : Tile.Floor
      if (ch === '@') start = { x, y }
      else if (ch !== '.' && ch !== '~') (marks[ch] ??= []).push({ x, y })
    }
  }
  return { tiles, start, marks }
}

/** A fixed realm so the tutorial never rolls content. */
function stageRealm(stage: 0 | 1): RealmDef {
  const biome = BIOMES.find(b => b.id === STAGE_BIOMES[stage]) ?? BIOMES[0]
  return {
    index: stage + 1, difficulty: 1, biome, seed: 0x7d7 + stage,
    monsterIds: [], counts: {}, reward: 'components',
    tags: ['教学'],
  }
}

// ------------------------------------------------------------------- the script

/** Spells the tutorial hands out, in slot order. */
const KIT = ['magic_missile', 'fireball', 'icicle', 'wolf']

const STEPS: TutorialStep[] = [
  {
    stage: 0,
    title: '移动',
    body: [
      '巫师每回合走一格，八个方向都行 —— 斜着走也只算一步。',
      '走到高亮的格子上。用方向键、WASD 或小键盘，斜向是 Q E Z X；也可以直接点击相邻格子。',
    ],
    goal: { kind: 'move', mark: 'a' },
  },
  {
    stage: 0,
    title: '检视',
    body: [
      '把鼠标移到高亮格子上的巨鼠身上。',
      '右栏会列出它的生命、种族标签、抗性和技能。开打之前先看清对手 —— 这游戏没有随机命中，信息就是一切。',
    ],
    goal: { kind: 'examine', mark: 'b' },
    setup: t => t.spawn('giant_rat', 'b', { still: true }),
  },
  {
    stage: 0,
    title: '视线',
    body: [
      '想打它，先要看得见它。石墙完全阻断视线，法术不会拐弯。',
      '走到高亮格子 —— 穿过门口进入那个房间，就能看见它了。（高亮指的是落脚点，不是巨鼠自己那格：有单位站着的格子走不上去。）',
    ],
    goal: { kind: 'move', mark: 'x' },
    until: g => {
      const rat = g.enemies[0]
      return !!rat && g.level.hasLOS(g.player.x, g.player.y, rat.x, rat.y)
    },
  },
  {
    stage: 0,
    title: '施放法术',
    body: [
      '巫师**不能近战**。走到怪身上不会攻击，只会被拦住 —— 一切都靠法术。',
      '按 1 选中「魔法飞弹」，然后点击巨鼠（或用方向键移动准星后按回车）。飞弹是奥术伤害，绝不落空。',
    ],
    goal: { kind: 'cast', ref: 'magic_missile' },
    until: g => g.enemies.length === 0,
  },
  {
    stage: 0,
    title: '范围法术',
    body: [
      '中央房间里挤着四只巨鼠。「火球」以目标格为中心炸开一片 —— 对付成群的敌人，落点比目标更重要。',
      '按 2 选中「火球」，点在鼠群中间，一次清掉它们。',
    ],
    goal: { kind: 'cast', ref: 'fireball' },
    setup: t => {
      for (const p of t.marks('e')) t.spawnAt('giant_rat', p, { still: true })
    },
    until: g => g.enemies.length === 0,
  },
  {
    stage: 0,
    title: '等待一回合',
    body: [
      '一只巨鼠正从远处冲过来。你行动一次，然后场上所有单位各行动一次 —— 回合是严格交替的。',
      '按空格（或 `.`）原地等一回合，看它逼近。',
    ],
    goal: { kind: 'wait' },
    setup: t => t.spawn('giant_rat', 'i'),
  },
  {
    stage: 0,
    title: '抗性',
    body: [
      '赤色软泥对火焰抗性 50%，对冰霜抗性 -50%（也就是额外受伤）。抗性是硬乘算，100% 就是完全免疫。',
      '它在东边的房间里，超出了射程 —— **先走过去**，进门后再按 2 用「火球」打它，注意战报里被削掉的那一半伤害。',
    ],
    goal: { kind: 'cast', ref: 'fireball', mark: 'c' },
    setup: t => t.spawn('red_slime', 'c', { still: true }),
  },
  {
    stage: 0,
    title: '打它的弱点',
    body: [
      '换冰霜。按 3 用「冰锥」打同一只软泥 —— 负抗性让伤害反而更高，还有概率冻住它。',
      '伤害类型比伤害数字重要：法术书越杂，越不容易被一堵抗性墙卡住。',
    ],
    goal: { kind: 'cast', ref: 'icicle', mark: 'c' },
    until: g => g.enemies.every(u => u.def?.id !== 'red_slime'),
  },
  {
    stage: 0,
    title: '死亡效果',
    body: [
      '软泥死时分裂成两只小块 —— 有些敌人杀掉之后更麻烦，检视面板会提前告诉你。',
      '用任意法术清掉这些小块。',
    ],
    goal: { kind: 'cast' },
    until: g => g.enemies.length === 0,
  },
  {
    stage: 0,
    title: '角色面板',
    body: [
      '技能点（SP）随时可以在角色面板里换成新法术，没有职业、没有解锁顺序 —— 全部 71 个法术从第一层就对你开放。',
      '按 C 打开角色面板。',
    ],
    goal: { kind: 'panel', ref: 'charsheet' },
  },
  {
    stage: 0,
    title: '学一个法术',
    body: [
      '点击「毒刺」把它买下来（1 SP）。它造成持续伤害，是对付高生命目标的便宜手段。',
    ],
    goal: { kind: 'learn', ref: 'poison_sting' },
  },
  {
    stage: 0,
    title: '法术升级',
    body: [
      '每个法术有四项升级，**本局最多只能选两项** —— 这是构筑的核心取舍。',
      '在「毒刺」卡片下点击「+ 剧毒」，把中毒威力提上去。',
    ],
    goal: { kind: 'upgrade', ref: 'poison_sting' },
  },
  {
    stage: 0,
    title: '持续伤害',
    body: [
      '按 ESC 关闭面板，然后用「毒刺」打那只僵尸。',
      '中毒每回合结算一次，会显示在它的状态里。僵尸对物理和黑暗有抗性，但对毒素只有一半减免。',
    ],
    goal: { kind: 'cast', ref: 'poison_sting', mark: 'd' },
    setup: t => t.spawn('zombie', 'd', { still: true }),
  },
  {
    stage: 0,
    title: '召唤物',
    body: [
      '「召唤狼」在空格子上放一头狼，它每回合自己行动、替你挡住近战。',
      '按 4 选中「召唤狼」，点高亮的那格空地。召唤物是巫师最可靠的护甲。',
    ],
    goal: { kind: 'cast', ref: 'wolf', mark: 'w' },
  },
  {
    stage: 0,
    title: '充能与药剂',
    body: [
      '法术没有法力值，只有**充能**：用完就得等下一层才回满。左栏每个法术后面的数字就是余量。',
      '「法力药剂」一次补满**所有**法术 —— 所以法术书越宽，每瓶药剂越值钱。按 I 打开物品，用掉它。',
    ],
    goal: { kind: 'consumable', ref: 'mana_potion' },
    setup: t => {
      for (const s of t.game.player.spells) s.charges = Math.max(1, Math.floor(s.maxCharges * 0.2))
    },
  },
  {
    stage: 0,
    title: '拾取材料',
    body: [
      '合成材料散落在各层，走过去就能捡起。它们是本作神器的唯一来源。',
      '走到高亮格子上捡起那份材料。注意脚下 —— 中间那道深渊会让所有不会飞的东西直接死亡。',
    ],
    goal: { kind: 'move', mark: 'j' },
    setup: t => t.dropComponent('j', 'I', 2),
    until: g => g.run.components.I >= 2,
  },
  {
    stage: 0,
    title: '飞行与深渊',
    body: [
      '一只蝙蝠正从深渊对面飞过来 —— 会飞的单位无视深渊，你不行。',
      '用任意法术把它打下来。地形是你的武器，也是你的牢笼。',
    ],
    goal: { kind: 'cast' },
    setup: t => t.spawn('bat', 'm'),
    until: g => g.enemies.length === 0,
  },
  {
    stage: 0,
    title: '裂隙预览',
    body: [
      '清空一层后传送门才会开启，而每个门背后有什么是**公开**的。',
      '按 P 查看下一层的候选：生态、标签、奖励、精确的怪物名单。每层还能免费重掷一次（R）。',
    ],
    goal: { kind: 'panel', ref: 'portal' },
  },
  {
    stage: 0,
    title: '进入传送门',
    body: [
      '按 ESC 关闭预览，走到闪烁的传送门上按回车进入下一层。',
      '进入新层时：所有法术充能回满、生命上限提升、恢复一部分生命。',
    ],
    goal: { kind: 'portal' },
  },

  // ------------------------------------------------------------------ stage 2
  {
    stage: 1,
    title: '刷怪门',
    body: [
      '「恶魔之门」不会移动，但每隔几回合就吐出一只小鬼，而且永远不停。',
      '把鼠标移到它身上看清它的抗性 —— 火焰 75%，别用火烧它。',
    ],
    goal: { kind: 'examine', mark: 'a' },
    setup: t => {
      t.spawn('demon_gate', 'a')
      t.spawn('imp', 'b')
    },
  },
  {
    stage: 1,
    title: '目标优先级',
    body: [
      '先拆门。放着不管，它的产出会超过你的清理速度 —— 这是新手最常见的死法。',
      '用「魔法飞弹」或「冰锥」打掉它（它对火焰有抗性）。',
    ],
    goal: { kind: 'cast' },
    until: g => g.enemies.every(u => u.def?.id !== 'demon_gate'),
  },
  {
    stage: 1,
    title: '增益单位',
    body: [
      '白骨祭司自己很弱，但会给同伴套盾、加伤。跟刷怪门一样：**先杀支援，再杀主力**。',
      '它们在东边。走过去，清掉祭司和它带的骷髅 —— 祭司对黑暗、毒素、冰霜都有抗性，用奥术。',
    ],
    goal: { kind: 'cast' },
    setup: t => {
      t.spawn('bone_cleric', 'c')
      t.spawn('skeleton', 'f')
    },
    until: g => g.enemies.length === 0,
  },
  {
    stage: 1,
    title: '锻造',
    body: [
      '本作没有被动技能树 —— 强度来自**神器**：用材料熔铸，按槽位穿戴。',
      '按 F 打开锻造界面。',
    ],
    goal: { kind: 'panel', ref: 'craft' },
  },
  {
    stage: 1,
    title: '熔铸神器',
    body: [
      '点击「白霜戒」把它造出来（消耗 I:2）。它给所有冰霜法术 +2 伤害。',
      '每个槽位只能戴一件，同槽位换装会替换掉旧的。稀有材料能做出带触发效果的神器 —— 击杀时、施法时、受伤时。',
    ],
    goal: { kind: 'craft', ref: 'rime_band' },
  },
  {
    stage: 1,
    title: '加成生效',
    body: [
      '按 ESC 关闭锻造，用「冰锥」打那只僵尸 —— 伤害比刚才高了 2 点，神器加成是直接叠在法术上的。',
      '僵尸对火焰抗性 -50%，本来该用火；但现在你有冰霜加成，两条路都能走。这就是构筑。',
    ],
    goal: { kind: 'cast', ref: 'icicle', mark: 'h' },
    setup: t => t.spawn('zombie', 'h', { still: true }),
  },
  {
    stage: 1,
    title: '治疗',
    body: [
      '巫师的生命只在进入新层时恢复一部分，其余全靠药剂和治疗法术。',
      '按 I 用掉「治疗药剂」。',
    ],
    goal: { kind: 'consumable', ref: 'healing_potion' },
    setup: t => { t.game.player.hp = Math.max(1, Math.floor(t.game.player.effectiveMaxHP * 0.35)) },
  },
  {
    stage: 1,
    title: '清空这一层',
    body: [
      '最后一课：清空全部敌人，传送门才会开。',
      '解决掉剩下的敌人。死亡不可挽回 —— 真正的一局里，每次进入新层会自动存档，但死了存档就会删除。',
    ],
    goal: { kind: 'cast' },
    setup: t => {
      t.spawn('giant_rat', 'k')
      t.spawn('imp', 'n')
    },
    until: g => g.enemies.length === 0,
  },
]

export const TUTORIAL_STEP_COUNT = STEPS.length

// ----------------------------------------------------------------- the runner

export class Tutorial {
  step = 0
  stage: 0 | 1 = 0
  /** set once the current step's goal action has been performed */
  private hit = false
  private parsed: ParsedMap
  /** last rejection, so the UI can nudge without spamming the log */
  rejected = ''
  /**
   * True while the script itself is dressing the stage. Stage setup calls the
   * same player-facing APIs (learn a spell, place a unit), and those must not be
   * refused by the gate or counted as the player's move.
   */
  scripting = false

  constructor(readonly game: Game) {
    this.parsed = parseMap(STAGE_MAPS[0])
  }

  get current(): TutorialStep | undefined { return STEPS[this.step] }
  get done(): boolean { return this.step >= STEPS.length }

  /** Tiles the board should highlight for the current step. */
  get highlight(): Point[] {
    const s = this.current
    if (!s?.goal.mark) return []
    return this.marks(s.goal.mark)
  }

  marks(ch: string): Point[] { return this.parsed.marks[ch] ?? [] }
  mark(ch: string): Point | undefined { return this.parsed.marks[ch]?.[0] }

  // ------------------------------------------------------------- stage setup

  /** Build the level for `stage` and drop the wizard on its start tile. */
  buildLevel(stage: 0 | 1): Level {
    this.stage = stage
    this.parsed = parseMap(STAGE_MAPS[stage])
    const lvl = new Level(LEVEL_W, LEVEL_H)
    lvl.tiles.set(this.parsed.tiles)
    for (let i = 0; i < lvl.variant.length; i++) lvl.variant[i] = (i * 7 + i * i * 3) % 8
    lvl.biome = STAGE_BIOMES[stage]
    return lvl
  }

  get start(): Point { return this.parsed.start }

  /** Place a hostile on a named mark. */
  spawn(defId: string, mark: string, opts: { still?: boolean } = {}): void {
    const p = this.mark(mark)
    if (p) this.spawnAt(defId, p, opts)
  }

  spawnAt(defId: string, p: Point, opts: { still?: boolean } = {}): void {
    const g = this.game
    const u = g.makeUnit(defId)
    if (!u) return
    const spot = g.level.vacant(p.x, p.y, u.flying) ? p : this.nearVacant(p, u.flying)
    if (!spot) return
    u.x = spot.x; u.y = spot.y
    // Tutorial targets hold still unless the step is about being chased: a pack
    // scattering mid-lesson would make the instructions wrong.
    if (opts.still) u.stationary = true
    g.level.addUnit(u)
    g.applyPassives(u)
  }

  private nearVacant(p: Point, flying: boolean): Point | undefined {
    for (let r = 1; r <= 6; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
          const q = { x: p.x + dx, y: p.y + dy }
          if (this.game.level.vacant(q.x, q.y, flying)) return q
        }
      }
    }
    return undefined
  }

  dropComponent(mark: string, id: 'U' | 'T' | 'C' | 'H' | 'B' | 'I' | 'S' | 'O', count: number): void {
    const p = this.mark(mark)
    if (!p) return
    this.game.level.setItem({
      x: p.x, y: p.y, kind: 'component', ref: id, count,
      name: '合成材料', sprite: `comp_${id}`, color: '#c8a878',
    })
  }

  /**
   * Panels the player may open during the current step.
   *
   * Two things this must never do: lock the player inside a panel (so closing
   * one, the pause menu and the rules screen are always allowed), and forbid the
   * panel the current step's own goal needs — buying a spell requires the
   * character sheet to stay open, drinking a potion requires the inventory.
   */
  allowsPanel(mode: string): boolean {
    if (mode === 'play' || mode === 'menu' || mode === 'help') return true
    const goal = this.current?.goal
    if (!goal) return true
    if (goal.kind === 'panel') {
      if (goal.ref === mode) return true
    } else if (PANEL_FOR_GOAL[goal.kind] === mode) {
      return true
    }
    this.rejected = REFUSALS[goal.kind] ?? '现在还不能这么做。'
    return false
  }

  // ------------------------------------------------------------------- gating

  /**
   * Is `a` the one thing the player is supposed to do right now?
   * Anything else is refused, with a reason the UI can show.
   */
  allows(a: TutorialAction): boolean {
    const s = this.current
    if (!s) return true
    const goal = s.goal

    // Two things are always harmless and must never be refused:
    //   examine — it only reads state;
    //   move — it is the wizard's only way to reposition, and several steps put
    //     their target outside spell range on purpose. Refusing it would hard-lock
    //     the script with the target unreachable and unshootable.
    if (a.kind === 'move') return true
    if (a.kind === 'examine' && goal.kind !== 'examine') return true

    if (a.kind !== goal.kind) {
      this.rejected = REFUSALS[goal.kind] ?? '现在还不能这么做。'
      return false
    }
    if (goal.ref && a.ref !== goal.ref) {
      this.rejected = `这一步请使用「${REF_NAMES[goal.ref] ?? getArtifact(goal.ref)?.name ?? goal.ref}」。`
      return false
    }
    // `mark` on a cast goal names the required victim; on a move goal it is only
    // a hint, because the player picks their own path there.
    if (goal.kind === 'cast' && goal.mark && a.at) {
      const want = this.marks(goal.mark)
      const unit = this.game.level.unitAt(a.at.x, a.at.y)
      const onMark = want.some(p => p.x === a.at?.x && p.y === a.at?.y)
      if (!onMark && !unit) {
        this.rejected = '请瞄准高亮的目标。'
        return false
      }
    }
    return true
  }

  /** Record a successful action and advance when the step's goal is met. */
  notify(a: TutorialAction): void {
    const s = this.current
    if (!s) return
    if (a.kind === s.goal.kind) this.hit = true
    this.check()
  }

  /** Re-test the completion condition (also called after enemy turns). */
  check(): void {
    const s = this.current
    if (!s) return
    if (!this.satisfied(s)) return
    this.advance()
  }

  private satisfied(s: TutorialStep): boolean {
    if (s.until) return s.until(this.game)
    // A "walk to the marked tile" step is done on arrival, not on the first step
    // in any direction — the player is free to take whatever path they like.
    if (s.goal.kind === 'move' && s.goal.mark) {
      const p = this.game.player
      return this.marks(s.goal.mark).some(m => m.x === p.x && m.y === p.y)
    }
    return this.hit
  }

  private advance(): void {
    this.step++
    this.hit = false
    const next = this.current
    if (!next) { this.finish(); return }
    if (next.stage !== this.stage) return  // stage change happens via the portal
    this.game.log(`—— 教学 ${this.step + 1}/${STEPS.length}：${next.title} ——`, '#ffd84a')
    this.openStep()
  }

  /** Run the current step's dressing. Safe to call once per step. */
  openStep(): void {
    const s = this.current
    if (!s) return
    const prev = this.scripting
    this.scripting = true
    s.setup?.(this)
    this.scripting = prev
    // A step whose condition is already true (nothing left to kill, say) must
    // not stall the script.
    if (this.satisfied(s)) this.advance()
  }

  private finish(): void {
    const g = this.game
    g.mode = 'tutorialEnd' as GameMode
    g.log('教学完成。', '#ffd84a')
  }
}

/** The panel a non-panel goal needs kept open to be completable at all. */
const PANEL_FOR_GOAL: Partial<Record<TutorialGoalKind, string>> = {
  learn: 'charsheet',
  upgrade: 'charsheet',
  craft: 'craft',
  consumable: 'inventory',
}

/** Why an action was refused, keyed by what the step actually wants. */
const REFUSALS: Record<TutorialGoalKind, string> = {
  move: '这一步请走到高亮的格子上。',
  examine: '这一步请把鼠标移到高亮的格子上。',
  cast: '这一步请施放指定的法术。',
  wait: '这一步请按空格等待一回合。',
  panel: '这一步请打开指定的界面。',
  learn: '这一步请在角色面板里学习指定的法术。',
  upgrade: '这一步请购买指定的法术升级。',
  craft: '这一步请在锻造界面熔铸指定的神器。',
  consumable: '这一步请使用指定的物品。',
  preview: '这一步请查看裂隙预览。',
  portal: '这一步请走进传送门。',
}

const REF_NAMES: Record<string, string> = {
  magic_missile: '魔法飞弹', fireball: '火球', icicle: '冰锥', wolf: '召唤狼',
  poison_sting: '毒刺', mana_potion: '法力药剂', healing_potion: '治疗药剂',
  rime_band: '白霜戒', charsheet: '角色面板', craft: '锻造', portal: '裂隙预览',
  inventory: '物品',
}



// ------------------------------------------------------------------ entry point

/** Wipe the run state and drop the player into step one. */
export function startTutorial(g: Game): void {
  // The tutorial is a sandbox, not progress: it must never overwrite the real
  // save, so revoke storage permission before its throwaway run is rolled.
  g.persist = false
  g.newRun('tutorial')
  const t = new Tutorial(g)
  g.tutorial = t
  // `newRun` already logged a randomly rolled realm; the tutorial's realms are
  // hand-built, so that opening chatter would name the wrong biome.
  g.logLines.length = 0
  g.log('欢迎。跟着底部的指引走一遍，你就会了。', '#c8c8d8')
  enterStage(g, t, 0)
}

/** Build a tutorial stage, stock the wizard, and open its first step. */
export function enterStage(g: Game, t: Tutorial, stage: 0 | 1): void {
  t.scripting = true
  t.stage = stage
  g.run.realm = stageRealm(stage)
  g.run.realmIndex = stage + 1
  g.run.rerollUsed = false
  g.level = t.buildLevel(stage)
  g.level.invalidateLOS()
  g.level.placeUnit(g.player, t.start.x, t.start.y)
  g.level.addUnit(g.player)
  g.fx.clear()

  // A fixed kit, so every instruction can name a specific hotkey. SP is topped
  // up first because `learnSpell` charges for it, then set to exactly what the
  // remaining lessons need (learn one spell, buy one upgrade).
  if (stage === 0) {
    g.run.sp = 99
    for (const id of KIT) g.learnSpell(id)
    g.run.sp = 3
    g.run.spSpent = 0
    g.run.inventory.length = 0
    g.run.inventory.push({ id: 'mana_potion', count: 1 })
    g.player.hp = g.player.effectiveMaxHP
  } else {
    g.run.inventory.push({ id: 'healing_potion', count: 1 })
  }
  for (const s of g.player.spells) s.charges = s.maxCharges

  // Portals: stage 0 leads to stage 1; stage 1 ends the tutorial.
  g.level.portals.length = 0
  if (stage === 0) {
    const p = t.mark('p')
    if (p) g.level.portals.push({ x: p.x, y: p.y, realm: stageRealm(1), taken: false })
  }
  g.run.nextOptions = stage === 0 ? [stageRealm(1)] : []

  t.openStep()
  t.scripting = false
  g.mode = 'play'
  // `newRun`/`enterRealm` left a headline naming a randomly rolled realm.
  g.report = emptyReport()
  g.report.headline = `教学第 ${stage + 1} 层：${g.run.realm.biome.name}`
  g.report.headlineColor = '#ffd84a'
  const step = t.current
  g.log(`—— 教学第 ${stage + 1} 层：${g.run.realm.biome.name} ——`, '#c0a0ff')
  if (step) g.log(`—— 教学 ${t.step + 1}/${TUTORIAL_STEP_COUNT}：${step.title} ——`, '#ffd84a')
  g.onChange()
}

/** The wizard cannot die in the tutorial; the lesson would be lost. */
export function tutorialRevive(g: Game): void {
  g.player.hp = g.player.effectiveMaxHP
  for (const b of g.player.buffs.slice()) {
    if (!b.hidden) g.player.buffs.splice(g.player.buffs.indexOf(b), 1)
  }
  const shield = makeBuff('shielded', 3, 1)
  if (shield) applyBuff(g, g.player, shield)
  g.log('教学中不会死亡：生命已恢复。', '#ffd84a')
}
