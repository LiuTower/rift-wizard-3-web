import type { Game } from '../core/game'
import { getArtifacts, getConsumable, getSpellDefs, getUnitDef, contentCounts } from '../core/registry'
import { canCraft, craftArtifact, recipeText } from '../core/crafting'
import { REWARD_NAMES } from '../core/realm'
import { COMPONENTS, COMPONENT_IDS, DAMAGE_NAMES, SLOT_NAMES, TAG_COLORS, TAG_NAMES, type DamageType, type Tag } from '../core/types'
import { SpellInst } from '../core/spell'
import { clear, el, spriteImg } from './dom'
import { hideTooltip } from './panels'
import { audio } from '../audio'

let spellFilter = ''
let spellTab: 'all' | 'known' | 'affordable' = 'all'
let craftTab: 'affordable' | 'all' | 'worn' = 'affordable'

function line(text: string, color?: string): HTMLDivElement {
  const d = el('div', undefined, text)
  if (color) d.style.color = color
  return d
}

function sheet(title: string, subtitle: string): { box: HTMLDivElement; body: HTMLDivElement } {
  const box = el('div', 'sheet')
  box.append(el('h1', undefined, title))
  box.append(el('div', 'sub', subtitle))
  const body = el('div')
  box.append(body)
  return { box, body }
}

function tagLine(tags: readonly Tag[]): HTMLDivElement {
  const d = el('div', 'card-tags')
  tags.forEach((t, i) => {
    const s = el('span', undefined, (i ? ' · ' : '') + TAG_NAMES[t])
    s.style.color = TAG_COLORS[t]
    d.append(s)
  })
  return d
}

/** Character sheet = the spell shop. Any spell, any time, priced in SP. */
function renderCharSheet(g: Game, root: HTMLElement): void {
  const { box, body } = sheet(
    '角色面板',
    `可用 SP ${g.run.sp} · 已习得 ${g.player.spells.length} 个法术 · 已花费 ${g.run.spSpent} SP。` +
    '点击法术即可学习，点击升级项即可购买（每个法术两项）。按 ESC 关闭。',
  )

  const tabs = el('div', 'tabs')
  const mk = (id: typeof spellTab, label: string) => {
    const t = el('div', `tab${spellTab === id ? ' on' : ''}`, label)
    t.onclick = () => { spellTab = id; renderOverlay(g) }
    tabs.append(t)
  }
  mk('all', '全部法术')
  mk('known', '我的法术书')
  mk('affordable', '买得起的')
  const search = el('input')
  search.value = spellFilter
  search.placeholder = '按名称或标签筛选'
  search.style.cssText = 'background:#07070a;border:1px solid #3a3a46;color:#c8c8d8;padding:2px 6px;border-radius:4px;font:inherit;margin-left:auto'
  search.oninput = () => { spellFilter = search.value.toLowerCase(); renderOverlay(g); search.focus() }
  tabs.append(search)
  body.append(tabs)

  const grid = el('div', 'grid-cards')
  const known = new Map(g.player.spells.map(s => [s.id, s]))
  const defs = getSpellDefs().filter(d => {
    if (spellTab === 'known' && !known.has(d.id)) return false
    if (spellTab === 'affordable' && (known.has(d.id) || d.level > g.run.sp)) return false
    if (!spellFilter) return true
    return d.name.toLowerCase().includes(spellFilter) || d.tags.some(t => t.includes(spellFilter))
  })

  for (const def of defs) {
    const inst = known.get(def.id)
    const card = el('div', 'card')
    if (inst) card.classList.add('owned')
    else if (def.level > g.run.sp) card.classList.add('locked')

    const head = el('div', 'card-head')
    head.append(spriteImg(def.icon, 20))
    const name = el('span', 'card-name', def.name)
    name.style.color = def.color ?? '#ffffff'
    head.append(name)
    head.append(el('span', 'card-cost', inst ? '已习得' : `${def.level} SP`))
    card.append(head)
    card.append(tagLine(def.tags))

    const preview = inst ?? new SpellInst(def, g.player)
    card.append(el('div', 'card-desc', preview.describe()))
    const bits: string[] = []
    if (preview.range > 0) bits.push(`射程 ${preview.range}`)
    if (preview.radius > 0) bits.push(`半径 ${preview.radius}`)
    if (preview.duration > 0) bits.push(`持续 ${preview.duration}`)
    bits.push(`充能 ${preview.maxCharges}`)
    if (def.channel) bits.push(`引导 ${def.channel} 回合`)
    if (def.hpCost) bits.push(`消耗 ${def.hpCost} 生命`)
    card.append(line(bits.join(' · '), '#8890a0'))

    if (!inst) {
      card.onclick = () => {
        if (g.learnSpell(def.id)) { audio.play('levelup'); renderOverlay(g) }
        else audio.play('ui_error')
      }
    }

    const ups = el('div', 'card-up')
    for (const up of def.upgrades) {
      const taken = inst?.hasUpgrade(up.id) ?? false
      const cost = up.cost ?? def.level
      const blocked = !inst || taken || inst.upgradePicksLeft <= 0 || g.run.sp < cost
      const row = el('div', `up-row${taken ? ' taken' : blocked ? ' blocked' : ''}`)
      row.append(el('span', undefined, `${taken ? '\u2713' : '+'} ${up.name}`))
      const c = el('span', undefined, taken ? '' : `${cost} SP`)
      c.style.marginLeft = 'auto'
      row.append(c)
      row.title = up.desc
      if (!blocked && inst) {
        row.onclick = ev => {
          ev.stopPropagation()
          if (g.buyUpgrade(def.id, up.id)) { audio.play('levelup'); renderOverlay(g) }
          else audio.play('ui_error')
        }
      }
      ups.append(row)
      ups.append(line(`   ${up.desc}`, taken ? '#4a8a5a' : '#6a6a76'))
    }
    card.append(ups)
    if (def.flavor) card.append(line(def.flavor, '#5a5a66'))
    grid.append(card)
  }

  body.append(grid)
  if (!defs.length) body.append(line('没有符合筛选条件的法术。', '#8890a0'))
  root.append(box)
}

/** Crafting: fuse components into artifacts. Replaces passive skills. */
function renderCraft(g: Game, root: HTMLElement): void {
  let total = 0
  for (const id of COMPONENT_IDS) total += g.run.components[id]
  const { box, body } = sheet(
    '锻造',
    `持有 ${total} 份材料。将其熔铸为神器，每个槽位只能装备一件。按 ESC 关闭。`,
  )

  const pouch = el('div', 'comp-line')
  pouch.style.marginBottom = '0.6em'
  for (const id of COMPONENT_IDS) {
    const n = g.run.components[id]
    const s = el('span', undefined, `${id} ${COMPONENTS[id].name}: ${n}`)
    s.style.color = n > 0 ? COMPONENTS[id].color : '#3a3a44'
    s.style.marginRight = '10px'
    pouch.append(s)
  }
  body.append(pouch)

  const worn = el('div')
  worn.style.marginBottom = '0.6em'
  for (const slot of Object.keys(SLOT_NAMES) as (keyof typeof SLOT_NAMES)[]) {
    const art = g.run.equipment[slot]
    const row = el('div', 'row')
    row.append(el('span', 'row-label', `${SLOT_NAMES[slot]}:`))
    const v = el('span', 'row-value', art ? art.name : '—')
    v.style.color = art ? (art.color ?? '#ffffff') : '#4a4a54'
    row.append(v)
    worn.append(row)
  }
  body.append(worn)

  const tabs = el('div', 'tabs')
  const mk = (id: typeof craftTab, label: string) => {
    const t = el('div', `tab${craftTab === id ? ' on' : ''}`, label)
    t.onclick = () => { craftTab = id; renderOverlay(g) }
    tabs.append(t)
  }
  mk('affordable', '当前可铸')
  mk('all', '全部配方')
  mk('worn', '已装备')
  body.append(tabs)

  const grid = el('div', 'grid-cards')
  const wornIds = new Set(Object.values(g.run.equipment).filter(Boolean).map(a => a?.id))
  const list = getArtifacts().filter(a => {
    const ok = canCraft(g.run.components, a)
    if (craftTab === 'affordable') return ok && !wornIds.has(a.id)
    if (craftTab === 'worn') return wornIds.has(a.id)
    return true
  })

  for (const art of list) {
    const ok = canCraft(g.run.components, art)
    const isWorn = wornIds.has(art.id)
    const card = el('div', `card${isWorn ? ' owned' : ok ? '' : ' locked'}`)
    const head = el('div', 'card-head')
    head.append(spriteImg(art.sprite, 20))
    const name = el('span', 'card-name', art.name)
    name.style.color = art.color ?? '#ffffff'
    head.append(name)
    head.append(el('span', 'card-cost', recipeText(art)))
    card.append(head)
    card.append(line(`${SLOT_NAMES[art.slot]} · ${art.tier} 阶`, '#8890a0'))
    card.append(el('div', 'card-desc', art.desc))
    const extra: string[] = []
    if (art.maxHP) extra.push(`生命上限 +${art.maxHP}`)
    if (art.shields) extra.push(`护盾 +${art.shields}`)
    if (art.resists) {
      for (const [k, v] of Object.entries(art.resists)) extra.push(`${DAMAGE_NAMES[k as DamageType]} ${v && v > 0 ? '+' : ''}${v}%`)
    }
    if (extra.length) card.append(line(extra.join(' · '), '#9ad0ff'))
    if (isWorn) card.append(line('已装备', '#7affa0'))
    else if (!ok) {
      const missing = COMPONENT_IDS.filter(id => (art.cost[id] ?? 0) > g.run.components[id])
        .map(id => `${id}:${(art.cost[id] ?? 0) - g.run.components[id]}`)
      card.append(line(`缺少 ${missing.join(' ')}`, '#ff8080'))
    } else {
      const occupant = g.run.equipment[art.slot]
      if (occupant) card.append(line(`将替换 ${occupant.name}`, '#ffd84a'))
      card.onclick = () => {
        if (craftArtifact(g, art)) { audio.play('levelup'); renderOverlay(g) }
        else audio.play('ui_error')
      }
    }
    grid.append(card)
  }
  body.append(grid)
  if (!list.length) body.append(line('暂无可用配方 —— 去收集更多材料。', '#8890a0'))
  root.append(box)
}

function renderPortals(g: Game, root: HTMLElement): void {
  const { box, body } = sheet(
    '裂隙',
    g.cleared
      ? '走到地图上带编号的传送门即可前往。按 R 可重掷本领域的裂隙（每领域一次）。按 ESC 关闭。'
      : '领域清空之前，传送门保持封闭。按 ESC 关闭。',
  )
  const grid = el('div', 'portal-grid')
  for (const p of g.level.portals) {
    const card = el('div', 'card')
    const head = el('div', 'card-head')
    head.append(spriteImg('portal', 20))
    const name = el('span', 'card-name', `第 ${p.realm.index} 领域 —— ${p.realm.biome.name}`)
    name.style.color = p.realm.biome.wallInk
    head.append(name)
    head.append(el('span', 'card-cost', `位置 ${p.x},${p.y}`))
    card.append(head)
    card.append(line(p.realm.tags.join(' · '), '#c0a0ff'))
    card.append(line(`奖励：${REWARD_NAMES[p.realm.reward]}`, '#ffd84a'))
    if (p.realm.boss) card.append(line('首领领域', '#ff5a5a'))
    card.append(line('栖息者：', '#8890a0'))
    for (const [id, n] of Object.entries(p.realm.counts)) {
      card.append(line(`  ${n} × ${getUnitDef(id)?.name ?? id}`))
    }
    grid.append(card)
  }
  body.append(grid)
  if (!g.run.rerollUsed && g.run.realmIndex < 20) {
    const btn = el('div', 'menu-item', '[R] 重掷这些裂隙（免费，每领域一次）')
    btn.style.marginTop = '0.8em'
    btn.style.color = '#ffd84a'
    btn.onclick = () => { g.rerollPortals(); renderOverlay(g) }
    body.append(btn)
  }
  root.append(box)
}

function renderHelp(g: Game, root: HTMLElement): void {
  const counts = contentCounts()
  const { box, body } = sheet('玩法说明', '《Rift Wizard 3》复刻版：清空敌人，进入传送门，重复二十次。')
  const rows: [string, string][] = [
    ['移动', '方向键 / WASD / 小键盘（八方向），对角线用 Q E Z X'],
    ['等待一回合', '空格 或 .（引导中的法术会继续引导）'],
    ['施放法术', '按 1-9 或点击左栏法术，然后点击目标（也可用方向键移动准星后按回车）'],
    ['取消瞄准', '右键 或 ESC'],
    ['使用物品', '点击左栏物品，或按 I'],
    ['角色面板', 'C —— 随时用 SP 学习法术、购买升级'],
    ['锻造', 'F —— 把材料熔铸成神器（本作没有被动技能树）'],
    ['裂隙预览', 'P —— 查看每个传送门背后有什么。按 R 每领域可重掷一次'],
    ['检视', '把鼠标移到任意格子上：右栏会显示生物、抗性与技能'],
    ['跳过动画', '按住或轻按 Ctrl'],
    ['静音', 'M'],
  ]
  body.append(el('h2', undefined, '操作'))
  for (const [k, v] of rows) {
    const row = el('div', 'row')
    const l = el('span', 'row-label', k)
    l.style.color = '#ffffff'
    l.style.flex = '0 0 12rem'
    row.append(l, el('span', undefined, v))
    body.append(row)
  }

  body.append(el('h2', undefined, '决定成败的规则'))
  const rules = [
    '进入新领域时充能全部回满。法力药剂一次补满所有法术，所以法术书越宽，每瓶药剂越值。',
    '巫师不能近战。站位与视线是你唯一的防御 —— 尽早买一个位移法术。',
    '优先杀刷怪门和增益单位：放着不管，它们的产出会超过你的清理速度。',
    '伤害类型多样比专精更重要。敌人有硬抗性（100% 为免疫，负值则额外受伤）。',
    '只有清空全部敌人后传送门才会开启。非飞行单位被推入深渊会立即死亡。',
    '每个法术可从四项升级中选两项 —— 本局永久生效。',
    '死亡不可挽回。每次进入新领域时会自动存档。',
  ]
  for (const r of rules) body.append(line(`• ${r}`))

  body.append(el('h2', undefined, '本版本内容'))
  body.append(line(`${counts.spells} 个法术 · ${counts.units} 种生物 · ${counts.artifacts} 件神器 · ${counts.consumables} 种消耗品 · ${counts.sprites} 张精灵图`, '#8890a0'))
  root.append(box)
}

function renderMenu(g: Game, root: HTMLElement): void {
  const { box, body } = sheet('菜单', `第 ${g.run.realmIndex} 领域 · 种子 ${g.run.seed}`)
  const items: [string, () => void][] = [
    ['继续游戏', () => { g.mode = 'play'; renderOverlay(g) }],
    ['玩法说明', () => { g.mode = 'help'; renderOverlay(g) }],
    ['角色面板', () => { g.mode = 'charsheet'; renderOverlay(g) }],
    ['锻造', () => { g.mode = 'craft'; renderOverlay(g) }],
    [audio.muted ? '开启音效' : '静音', () => { audio.setMuted(!audio.muted); renderOverlay(g) }],
    ['放弃本局并重新开始', () => { if (confirm('确定放弃这一局？')) { g.newRun(); g.mode = 'play'; renderOverlay(g) } }],
  ]
  for (const [label, fn] of items) {
    const d = el('div', 'menu-item', label)
    d.style.margin = '0.35em 0'
    d.onclick = fn
    body.append(d)
  }
  root.append(box)
}

function renderTitle(g: Game, root: HTMLElement, onStart: (seed?: string) => void, canContinue: boolean): void {
  const box = el('div', 'center-box')
  const art = el('div', 'title-art')
  art.textContent = [
    ' ____  _ _____ _____   __        _____ _____   _    ____  ____  ',
    '|  _ \\| |  ___|_   _|  \\ \\      / /_ _|__  /  / \\  |  _ \\|  _ \\ ',
    '| |_) | | |_    | |     \\ \\ /\\ / / | |  / /  / _ \\ | |_) | | | |',
    '|  _ <| |  _|   | |      \\ V  V /  | | / /_ / ___ \\|  _ <| |_| |',
    '|_| \\_\\_|_|     |_|       \\_/\\_/  |___/____/_/   \\_\\_| \\_\\____/ ',
    '',
    '                    T  H  R  E  E                              ',
  ].join('\n')
  box.append(art)
  box.append(line('硬核回合制网格 Roguelike。二十个领域，一个巫师，绝无仁慈。', '#8890a0'))
  box.append(el('div', undefined, ' '))

  const newRun = el('div', 'menu-item', '> 开始新的一局')
  newRun.style.color = '#ffd84a'
  newRun.onclick = () => onStart()
  box.append(newRun)

  if (canContinue) {
    const cont = el('div', 'menu-item', '> 继续上次进度')
    cont.onclick = () => { if (!g.loadRun()) { g.log('存档无法读取。', '#ff8080'); onStart() } }
    box.append(cont)
  }

  const seedRow = el('div')
  seedRow.style.marginTop = '0.8em'
  const input = el('input')
  input.placeholder = '自定义种子'
  input.style.cssText = 'background:#07070a;border:1px solid #3a3a46;color:#c8c8d8;padding:2px 6px;border-radius:4px;font:inherit'
  const go = el('span', 'menu-item', '  > 用该种子开始')
  go.onclick = () => onStart(input.value || undefined)
  seedRow.append(input, go)
  box.append(seedRow)

  box.append(el('div', undefined, ' '))
  box.append(line('游戏中按 H 查看完整规则。把鼠标移到任何东西上都能检视。', '#5a5a66'))
  const counts = contentCounts()
  box.append(line(`${counts.spells} 个法术 · ${counts.units} 种生物 · ${counts.artifacts} 件神器`, '#5a5a66'))
  root.append(box)
}

function renderEnd(g: Game, root: HTMLElement, won: boolean, onStart: (seed?: string) => void): void {
  const box = el('div', 'center-box')
  const title = el('h1', undefined, won ? '裂隙归于沉寂' : '你死了')
  title.style.color = won ? '#ffd84a' : '#ff4d4d'
  box.append(title)
  box.append(line(g.endMessage, '#c8c8d8'))
  box.append(el('div', undefined, ' '))
  const rows: [string, string][] = [
    ['清空领域', String(g.stats.realmsCleared)],
    ['总回合数', String(g.stats.turns)],
    ['施法次数', String(g.stats.spellsCast)],
    ['造成伤害', String(g.stats.damageDealt)],
    ['受到伤害', String(g.stats.damageTaken)],
    ['击杀敌人', String(g.stats.killCount)],
    ['花费 SP', String(g.run.spSpent)],
    ['习得法术', String(g.player.spells.length)],
    ['种子', g.run.seed],
  ]
  for (const [k, v] of rows) {
    const row = el('div', 'row')
    row.append(el('span', 'row-label', k), el('span', 'row-value', v))
    box.append(row)
  }

  const top = [...g.stats.damageBySpell.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  if (top.length) {
    box.append(el('h2', undefined, '伤害来源'))
    for (const [name, amount] of top) {
      const row = el('div', 'row')
      row.append(el('span', 'row-label', name), el('span', 'row-value', String(amount)))
      box.append(row)
    }
  }

  box.append(el('div', undefined, ' '))
  const again = el('div', 'menu-item', '> 再来一局')
  again.style.color = '#ffd84a'
  again.onclick = () => onStart()
  box.append(again)
  root.append(box)
}

export interface OverlayHooks {
  onStart: (seed?: string) => void
  canContinue: () => boolean
}

let hooks: OverlayHooks = { onStart: () => {}, canContinue: () => false }

export function initOverlays(h: OverlayHooks): void { hooks = h }

/** Draw whichever full-screen panel the current mode calls for. */
export function renderOverlay(g: Game): void {
  const root = document.getElementById('overlay')
  if (!root) return
  hideTooltip()
  clear(root)
  const showing = g.mode !== 'play' && g.mode !== 'aim'
  root.classList.toggle('show', showing)
  if (!showing) return
  switch (g.mode) {
    case 'charsheet': renderCharSheet(g, root); break
    case 'craft': renderCraft(g, root); break
    case 'portal': renderPortals(g, root); break
    case 'help': renderHelp(g, root); break
    case 'menu': renderMenu(g, root); break
    case 'inventory': renderInventory(g, root); break
    case 'title': renderTitle(g, root, hooks.onStart, hooks.canContinue()); break
    case 'dead': renderEnd(g, root, false, hooks.onStart); break
    case 'win': renderEnd(g, root, true, hooks.onStart); break
  }
}

function renderInventory(g: Game, root: HTMLElement): void {
  const { box, body } = sheet('物品', '点击或按对应数字键使用。按 ESC 关闭。')
  if (!g.run.inventory.length) body.append(line('你的行囊是空的。', '#8890a0'))
  g.run.inventory.forEach((entry, i) => {
    const defs = getConsumable(entry.id)
    if (!defs) return
    const card = el('div', 'card')
    const head = el('div', 'card-head')
    head.append(spriteImg(defs.sprite, 20))
    const name = el('span', 'card-name', `${i + 1}. ${defs.name}`)
    name.style.color = defs.color
    head.append(name)
    head.append(el('span', 'card-cost', `×${entry.count}`))
    card.append(head)
    card.append(el('div', 'card-desc', defs.desc))
    card.onclick = () => {
      g.mode = 'play'
      g.beginAimConsumable(defs.id)
      renderOverlay(g)
    }
    body.append(card)
  })
  root.append(box)
}


