import { rasterize, fallbackSprite } from '../render/sprite'
import { getSprites } from '../core/registry'

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (text !== undefined) node.textContent = text
  return node
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild)
}

const urlCache = new Map<string, string>()

/** Sprite as an <img> so DOM panels can show the same art as the board. */
export function spriteImg(key: string, size: number): HTMLImageElement {
  const cacheKey = `${key}@${size}`
  let url = urlCache.get(cacheKey)
  if (!url) {
    const defs = getSprites()
    const def = defs[key] ?? fallbackSprite(key)
    url = rasterize(`ui:${key}`, def, size).toDataURL()
    urlCache.set(cacheKey, url)
  }
  const img = el('img', 'spr')
  img.src = url
  img.width = size
  img.height = size
  img.alt = ''
  return img
}

/** `label` + right-aligned `value` row, the sidebar's basic building block. */
export function statRow(parent: HTMLElement, label: string, value: string, labelColor?: string, valueColor?: string): HTMLDivElement {
  const row = el('div', 'row')
  const l = el('span', 'row-label', label)
  if (labelColor) l.style.color = labelColor
  const v = el('span', 'row-value', value)
  if (valueColor) v.style.color = valueColor
  row.append(l, v)
  parent.append(row)
  return row
}

export function heading(parent: HTMLElement, text: string): HTMLDivElement {
  const h = el('div', 'heading', text)
  parent.append(h)
  return h
}

export function spacer(parent: HTMLElement, px = 10): void {
  const s = el('div')
  s.style.height = `${px}px`
  parent.append(s)
}
