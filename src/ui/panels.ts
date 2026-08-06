import type { Game } from '../core/game'
import type { Unit } from '../core/unit'
import { primaryDamageType, type SpellInst } from '../core/spell'
import { COMPONENTS, COMPONENT_IDS, CREATURE_TAG_NAMES, DAMAGE_COLORS, DAMAGE_NAMES, DAMAGE_TYPES, EQUIP_SLOTS, SLOT_NAMES, TAG_COLORS, TAG_NAMES } from '../core/types'
import { makeBuff, visibleBuffs } from '../core/buffs'
import { getConsumable, getUnitDef } from '../core/registry'
import { clear, el, heading, spriteImg } from './dom'

const ICON = 17

let tooltipNode: HTMLDivElement | undefined

export function tooltip(): HTMLDivElement {
  if (!tooltipNode) {
    tooltipNode = el('div', 'tooltip')
    document.body.append(tooltipNode)
  }
  return tooltipNode
}

export function showTooltip(html: HTMLElement[], x: number, y: number): void {
  const tt = tooltip()
  clear(tt)
  tt.append(...html)
  tt.classList.add('show')
  const rect = tt.getBoundingClientRect()
  const px = Math.min(x + 14, window.innerWidth - rect.width - 8)
  const py = Math.min(y + 12, window.innerHeight - rect.height - 8)
  tt.style.left = `${Math.max(4, px)}px`
  tt.style.top = `${Math.max(4, py)}px`
}

export function hideTooltip(): void {
  tooltipNode?.classList.remove('show')
}

function line(text: string, color?: string): HTMLDivElement {
  const d = el('div', undefined, text)
  if (color) d.style.color = color
  return d
}

export function spellTooltip(s: SpellInst): HTMLElement[] {
  const out: HTMLElement[] = []
  const head = el('div', 'tt-name', `${s.name}（${s.def.level} 级）`)
  out.push(head)
  out.push(line(s.def.tags.map(t => TAG_NAMES[t]).join(' · '), '#8890a0'))
  out.push(line(s.describe()))
  const bits: string[] = []
  const school = primaryDamageType(s.def)
  if (school && s.damage > 0) bits.push(`${s.damage} 点${DAMAGE_NAMES[school]}伤害`)
  if (s.range > 0) bits.push(`射程 ${s.range}`)
  if (s.radius > 0) bits.push(`半径 ${s.radius}`)
  if (s.duration > 0) bits.push(`持续 ${s.duration}`)
  if (s.def.channel) bits.push(`引导 ${s.def.channel} 回合`)
  if (s.hpCost > 0) bits.push(`消耗 ${s.hpCost} 生命`)
  bits.push(`充能 ${s.charges}/${s.maxCharges}`)
  out.push(line(bits.join(' · '), '#8890a0'))
  if (s.upgradesTaken.length) {
    for (const id of s.upgradesTaken) {
      const up = s.def.upgrades.find(u => u.id === id)
      if (up) out.push(line(`+ ${up.name}: ${up.desc}`, '#7affa0'))
    }
  }
  if (s.upgradePicksLeft > 0) out.push(line(`还可选 ${s.upgradePicksLeft} 项升级（按 C）`, '#ffd84a'))
  if (s.def.flavor) out.push(line(s.def.flavor, '#6a6a76'))
  return out
}

export function unitTooltip(u: Unit): HTMLElement[] {
  const out: HTMLElement[] = []
  out.push(el('div', 'tt-name', u.name))
  out.push(line(`生命 ${u.hp}/${u.effectiveMaxHP}${u.shields ? `  护盾 ${u.shields}` : ''}`, '#ff8080'))
  const traits: string[] = []
  if (u.flying) traits.push('飞行')
  if (u.stationary) traits.push('固定不动')
  if (u.creatureTags.length) traits.push(...u.creatureTags.map(t => CREATURE_TAG_NAMES[t]))
  out.push(line(traits.join(' · '), '#8890a0'))

  const res = DAMAGE_TYPES.filter(t => u.resistOf(t) !== 0)
    .map(t => `${DAMAGE_NAMES[t]} ${u.resistOf(t) > 0 ? '+' : ''}${u.resistOf(t)}%`)
  if (res.length) out.push(line(res.join('  '), '#9ad0ff'))

  for (const a of u.attacks) {
    const parts = [a.name ?? a.kind]
    if (a.damage) parts.push(`${a.damage} 点${DAMAGE_NAMES[a.damageType ?? 'physical']}`)
    if (a.range && a.range > 1) parts.push(`射程 ${a.range}`)
    if (a.radius) parts.push(`半径 ${a.radius}`)
    if (a.cooldown) parts.push(`冷却 ${a.cooldown}`)
    if (a.summonId) parts.push(`召唤 ${a.summonCount ?? 1} 个`)
    if (a.buff) parts.push(makeBuff(a.buff, 1)?.name ?? a.buff)
    out.push(line(`· ${parts.join(' · ')}`, a.damageType ? DAMAGE_COLORS[a.damageType] : '#c8c8d8'))
  }

  const buffs = visibleBuffs(u)
  if (buffs.length) {
    out.push(line(buffs.map(b => `${b.name}${b.duration > 0 ? `（${b.duration}）` : ''}`).join('、'), '#ffd0f0'))
  }
  if (u.def?.description) out.push(line(u.def.description, '#8890a0'))
  return out
}

/** Left column: vitals, spellbook, equipment, components, statuses. */
export function renderSidebar(g: Game, root: HTMLElement, onSpellClick: (i: number) => void, onOpen: (mode: string) => void): void {
  clear(root)

  const hpRow = el('div', 'row')
  const hpLabel = el('span', 'row-label')
  const hpTag = el('span', undefined, '生命 ')
  hpTag.style.color = '#ff4d4d'
  const hpVal = el('span', undefined, `${Math.max(0, g.player.hp)}/${g.player.effectiveMaxHP}`)
  hpVal.style.color = '#ffffff'
  hpLabel.append(hpTag, hpVal)
  hpRow.append(hpLabel)
  if (g.player.shields > 0) {
    const sh = el('span', 'row-value', `护盾 ${g.player.shields}`)
    sh.style.color = '#c8d8ff'
    hpRow.append(sh)
  }
  root.append(hpRow)

  const spRow = el('div', 'row')
  const spLabel = el('span', 'row-label')
  const spTag = el('span', undefined, 'SP ')
  spTag.style.color = '#ffd84a'
  const spVal = el('span', undefined, String(g.run.sp))
  spVal.style.color = '#ffffff'
  spLabel.append(spTag, spVal)
  spRow.append(spLabel)
  root.append(spRow)

  root.append(line(`第 ${g.run.realmIndex} 领域 · 第 ${g.run.turn} 回合`))
  const enemies = g.enemies.length
  root.append(line(enemies ? `剩余敌人：${enemies}` : '领域已清空 —— 前往传送门', enemies ? '#8890a0' : '#7affa0'))

  const spellHead = heading(root, '法术（S）')
  spellHead.style.cursor = 'pointer'
  spellHead.onclick = () => onOpen('charsheet')

  if (!g.player.spells.length) {
    root.append(line('暂无 —— 按 C 学习法术', '#5a5a66'))
  }
  g.player.spells.forEach((s, i) => {
    const row = el('div', 'spell-row')
    if (g.aim?.kind === 'spell' && g.aim.spellIdx === i) row.classList.add('active')
    if (s.charges <= 0) row.classList.add('empty')
    row.append(el('span', 'idx', i < 9 ? String(i + 1) : '·'))
    row.append(spriteImg(s.def.icon, ICON))
    const name = el('span', 'name', s.name)
    name.style.color = s.charges > 0 ? (s.def.color ?? '#e0e0ec') : '#5a5a66'
    row.append(name)
    const ch = el('span', 'charges', String(s.charges))
    ch.style.color = s.charges > 0 ? '#c8c8d8' : '#5a5a66'
    row.append(ch)
    row.onclick = () => onSpellClick(i)
    row.onmouseenter = ev => showTooltip(spellTooltip(s), ev.clientX, ev.clientY)
    row.onmousemove = ev => showTooltip(spellTooltip(s), ev.clientX, ev.clientY)
    row.onmouseleave = hideTooltip
    root.append(row)
  })

  const eqHead = heading(root, '装备（F）')
  eqHead.style.cursor = 'pointer'
  eqHead.onclick = () => onOpen('craft')
  const strip = el('div', 'equip-strip')
  for (const slot of EQUIP_SLOTS) {
    const art = g.run.equipment[slot]
    if (art) {
      const img = spriteImg(art.sprite, ICON + 3)
      img.onmouseenter = ev => showTooltip([
        el('div', 'tt-name', art.name),
        line(SLOT_NAMES[slot], '#8890a0'),
        line(art.desc),
      ], ev.clientX, ev.clientY)
      img.onmouseleave = hideTooltip
      strip.append(img)
    } else {
      const dot = el('span', 'slot', '·')
      dot.title = SLOT_NAMES[slot]
      strip.append(dot)
    }
  }
  root.append(strip)

  let total = 0
  for (const id of COMPONENT_IDS) total += g.run.components[id]
  root.append(line(`材料：${total}`))
  const comps = el('div', 'comp-line')
  for (const id of COMPONENT_IDS) {
    const n = g.run.components[id]
    const span = el('span', undefined, `${id}:${n}`)
    span.style.color = n > 0 ? COMPONENTS[id].color : '#3a3a44'
    span.title = COMPONENTS[id].name
    comps.append(span)
  }
  root.append(comps)

  if (g.run.inventory.length) {
    heading(root, '物品（I）')
    g.run.inventory.forEach((entry, i) => {
      const def = getConsumable(entry.id)
      if (!def) return
      const row = el('div', 'item-row')
      row.append(el('span', 'idx', String(i + 1)))
      row.append(spriteImg(def.sprite, ICON))
      const name = el('span', 'name', `${def.name}${entry.count > 1 ? ` ×${entry.count}` : ''}`)
      name.style.color = def.color
      row.append(name)
      row.onmouseenter = ev => showTooltip([el('div', 'tt-name', def.name), line(def.desc)], ev.clientX, ev.clientY)
      row.onmouseleave = hideTooltip
      row.onclick = () => { g.beginAimConsumable(def.id) }
      root.append(row)
    })
  }

  const buffs = visibleBuffs(g.player)
  if (buffs.length) {
    heading(root, '状态效果：')
    for (const b of buffs) {
      const label = `${b.name}${b.stacks && b.stacks > 1 ? ` ×${b.stacks}` : ''}${b.duration > 0 ? `（${b.duration}）` : ''}`
      const row = line(label, b.color ?? '#c8c8d8')
      if (b.desc) {
        row.onmouseenter = ev => showTooltip([el('div', 'tt-name', b.name), line(b.desc ?? '')], ev.clientX, ev.clientY)
        row.onmouseleave = hideTooltip
      }
      root.append(row)
    }
  }

  const footer = el('div', 'footer')
  const items: [string, string][] = [
    ['菜单（ESC）', 'menu'],
    ['玩法说明（H）', 'help'],
    ['角色面板（C）', 'charsheet'],
    ['锻造（F）', 'craft'],
  ]
  for (const [label, mode] of items) {
    const d = el('div', undefined, label)
    d.onclick = () => onOpen(mode)
    footer.append(d)
  }
  root.append(footer)
}

/** Right column: examine panel when hovering, otherwise the turn report. */
export function renderReport(g: Game, root: HTMLElement): void {
  clear(root)

  const hovered = g.hover ? g.level.unitAt(g.hover.x, g.hover.y) : undefined
  if (hovered) {
    root.append(...unitTooltip(hovered))
    const item = g.hover ? g.level.itemAt(g.hover.x, g.hover.y) : undefined
    if (item) root.append(line(`地面：${item.name}`, item.color))
    root.append(el('div', undefined, ' '))
  } else if (g.hover) {
    const cloud = g.level.cloudAt(g.hover.x, g.hover.y)
    const item = g.level.itemAt(g.hover.x, g.hover.y)
    const portal = g.level.portalAt(g.hover.x, g.hover.y)
    if (cloud) {
      root.append(el('div', 'tt-name', cloud.name))
      root.append(line(`每回合 ${cloud.damage} 点${DAMAGE_NAMES[cloud.damageType]}伤害，剩余 ${cloud.duration} 回合`, DAMAGE_COLORS[cloud.damageType]))
    }
    if (item) {
      root.append(el('div', 'tt-name', item.name))
      root.append(line('走上去即可拾取。', '#8890a0'))
    }
    if (portal) {
      root.append(el('div', 'tt-name', `通往第 ${portal.realm.index} 领域的裂隙`))
      root.append(line(`${portal.realm.biome.name} —— ${portal.realm.tags.join('、')}`, '#c0a0ff'))
      for (const [id, n] of Object.entries(portal.realm.counts)) {
        root.append(line(`  ${n} × ${getUnitDef(id)?.name ?? id}`, '#8890a0'))
      }
    }
  }

  const r = g.report
  if (r.headline) {
    const head = el('div', 'report-head', r.headline)
    head.style.color = r.headlineColor
    root.append(head)
  }

  let dmgTotal = 0
  for (const v of r.damage.values()) dmgTotal += v
  if (dmgTotal > 0) {
    const row = el('div', 'row')
    row.append(el('span', 'row-label', '造成伤害：'), el('span', 'row-value', String(dmgTotal)))
    root.append(row)
    for (const [name, amount] of [...r.damage.entries()].sort((a, b) => b[1] - a[1])) {
      const sub = el('div', 'row')
      sub.append(el('span', 'row-label', name), el('span', 'row-value', String(amount)))
      root.append(sub)
    }
  }

  let killTotal = 0
  for (const v of r.kills.values()) killTotal += v
  if (killTotal > 0) {
    root.append(el('div', undefined, ' '))
    const row = el('div', 'row')
    row.append(el('span', 'row-label', '击杀敌人：'), el('span', 'row-value', String(killTotal)))
    root.append(row)
    for (const [name, amount] of [...r.kills.entries()].sort((a, b) => b[1] - a[1])) {
      const sub = el('div', 'row')
      sub.append(el('span', 'row-label', name), el('span', 'row-value', String(amount)))
      root.append(sub)
    }
  }

  if (r.taken > 0) {
    root.append(el('div', undefined, ' '))
    const row = el('div', 'row')
    const l = el('span', 'row-label', '受到伤害：')
    l.style.color = '#ff8080'
    row.append(l, el('span', 'row-value', String(r.taken)))
    root.append(row)
  }

  if (r.notes.length) {
    root.append(line(r.notes.join('  '), '#ffd84a'))
  }

  root.append(el('div', undefined, ' '))
  const recent = g.logLines.slice(-14)
  for (const l of recent) {
    const d = el('div', 'log-line', l.text)
    d.style.color = l.color
    root.append(d)
  }
}

export { line as uiLine, TAG_COLORS }
