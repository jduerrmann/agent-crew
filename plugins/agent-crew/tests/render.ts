import { FONT, fitText, textWidth, xml } from '../hooks/crab'

// Draws what a surface was handed (`ui.drawn()` on the desktop) as one SVG, for
// the README's pictures: Boxes, Texts and Buttons as the desktop app lays them
// out, the mod's own Svg pictures as they are, and its Clients (hotspot,
// filerows, searchbox) as they draw themselves. A rough flexbox: rows and
// columns, gaps, padding, borders, grow, wrap and the usual alignments, about 8
// px a column as in limits/no-pixel-width.md. It follows the light or dark
// colour scheme, as the mod's pictures do.

type El = { type: string; props?: Record<string, unknown>; children?: unknown[] }
type Seg = { t: string; c?: string; b?: boolean; dim?: boolean; pulse?: boolean; sh?: string; cls?: string }
type Size = { w: number; h: number }

/** One column, one text line, one row of margin or padding, in px. */
const CW = 8
const LH = 20
const V = 8
/** A border's room on each side. */
const BORDER = 4
const SIZE = 13

const THEME = `<style>
.bg{fill:#faf9f5}.pn{fill:#ffffff}.fr{stroke:#d6d5d1}.tx{fill:#1f1f1f}.dm{fill:#8a8a86}.b2{fill:#ecebe6}.b1{fill:#1f1f1f}.b1t{fill:#faf9f5}.hl{fill:#00000008}
@media (prefers-color-scheme: dark){.bg{fill:#1f1e1d}.pn{fill:#262624}.fr{stroke:#4a4a47}.tx{fill:#ececec}.dm{fill:#9a9a96}.b2{fill:#3a3a38}.b1{fill:#ececec}.b1t{fill:#1f1f1f}.hl{fill:#ffffff0a}}
.pulse{animation:pulse 1.6s ease-in-out infinite}@keyframes pulse{50%{opacity:.35}}
@media (prefers-reduced-motion: reduce){*{animation:none!important}}
</style>`

// Greys the mod uses for frames and lines follow the scheme; any other colour is its own.
const NEUTRAL = new Set(['#6b6b68', '#9a9a96', '#8a8a86', '#3a3a38'])

const el = (v: unknown): El | undefined => (v && typeof v === 'object' && typeof (v as El).type === 'string' ? (v as El) : undefined)
const kids = (n: El): El[] => (n.children ?? []).flatMap(c => (el(c) ? [el(c) as El] : []))
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
const p = (n: El) => n.props ?? {}
const isAbsolute = (n: El) => p(n).position === 'absolute'

// A Text's runs, its nested Texts' styles carried down.
const segsOf = (n: unknown, inherit: Seg = { t: '' }): Seg[] => {
  if (typeof n === 'string' || typeof n === 'number') return [{ ...inherit, t: String(n) }]
  const e = el(n)
  if (!e) return []
  const q = p(e)
  const style: Seg = {
    t: '',
    c: typeof q.color === 'string' ? q.color : inherit.c,
    b: q.bold === true || inherit.b,
    dim: q.dimColor === true || inherit.dim,
  }
  return (e.children ?? []).flatMap(c => segsOf(c, style))
}

const widthOf = (segs: Seg[], size = SIZE) => segs.reduce((w, s) => w + textWidth(s.t, size) * (s.b ? 1.04 : 1), 0)

// Greedy word wrap that keeps each run's style.
const wrap = (segs: Seg[], maxW: number, size = SIZE): Seg[][] => {
  const words = segs.flatMap(s => s.t.split(/(?<= )/).map(t => ({ ...s, t })))
  const lines: Seg[][] = [[]]
  let w = 0
  for (const word of words) {
    const ww = textWidth(word.t, size)
    if (w + ww > maxW && w > 0) {
      lines.push([])
      w = 0
    }
    lines.at(-1)?.push(word)
    w += ww
  }
  return lines
}

const fill = (c: string | undefined, dim: boolean | undefined): string => {
  if (!c) return ` class="${dim ? 'dm' : 'tx'}"`
  return ` fill="${c}"${dim ? ' opacity=".5"' : ''}`
}

let shimmerId = 0
const SHIMMER: Record<string, string[]> = {}

// One line of runs from x, its baseline at y.
const runs = (segs: Seg[], x: number, y: number, size = SIZE, extra = ''): string => {
  let out = `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${xml(FONT)}" font-size="${size}"${extra} xml:space="preserve">`
  for (const s of segs) {
    if (!s.t) continue
    const weight = s.b ? ' font-weight="600"' : ''
    const tones = s.sh ? SHIMMER[s.sh] : undefined
    if (tones) {
      const id = `sh${++shimmerId}`
      const w = Math.max(20, textWidth(s.t, size))
      const stops = [tones[0], tones[1], tones[2], tones[3], tones[2], tones[1], tones[0]]
        .map((c, i) => `<stop offset="${[0, 0.28, 0.42, 0.5, 0.58, 0.72, 1][i]}" stop-color="${c}"/>`)
        .join('')
      out = `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x - 40}" y1="0" x2="${x}" y2="0">${stops}<animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="${w + 80} 0" dur="1.2s" repeatCount="indefinite"/></linearGradient></defs>${out}`
      out += `<tspan fill="url(#${id})"${weight}>${xml(s.t)}</tspan>`
    } else out += `<tspan${s.cls ? ` class="${s.cls}"` : fill(s.c, s.dim)}${weight}${s.pulse ? ' class="pulse"' : ''}>${xml(s.t)}</tspan>`
  }
  return `${out}</text>`
}

const baseline = (y: number, h = LH) => y + h / 2 + SIZE * 0.36

// --- measuring

const pad = (n: El) => {
  const q = p(n)
  const b = q.borderStyle ? BORDER : 0
  const px = num(q.paddingX) ?? num(q.padding) ?? 0
  const py = num(q.paddingY) ?? num(q.padding) ?? 0
  return {
    l: b + (num(q.paddingLeft) ?? px) * CW,
    r: b + (num(q.paddingRight) ?? px) * CW,
    t: b + (num(q.paddingTop) ?? py) * V,
    b: b + (num(q.paddingBottom) ?? py) * V,
  }
}

const margin = (n: El) => {
  const q = p(n)
  const mx = num(q.marginX) ?? num(q.margin) ?? 0
  const my = num(q.marginY) ?? num(q.margin) ?? 0
  return {
    l: (num(q.marginLeft) ?? mx) * CW,
    r: (num(q.marginRight) ?? mx) * CW,
    t: (num(q.marginTop) ?? my) * V,
    b: (num(q.marginBottom) ?? my) * V,
  }
}

const isWide = (n: El): boolean => p(n).width === '100%'

const buttonLabel = (n: El): Seg[] => {
  const q = p(n)
  if (typeof q.label === 'string') return [{ t: q.label, dim: q.dimColor === true }]
  return (n.children ?? []).flatMap(c => segsOf(c, { t: '', dim: q.dimColor === true }))
}

// A diff or a file's text, in a code box: its first lines, the headers left out.
const CODE_LH = 16
const MONO = 'ui-monospace,SFMono-Regular,Consolas,monospace'
const codeLines = (n: El): string[] =>
  String(p(n).source ?? '')
    .split('\n')
    .filter(l => !/^(diff --git|index |--- |\+\+\+ )/.test(l))
    .slice(0, 14)

const clientOf = (n: El) => ({ module: String(p(n).module ?? ''), props: (p(n).props ?? {}) as Record<string, unknown> })

function measure(n: El, maxW: number): Size {
  const q = p(n)
  switch (n.type) {
    case 'Text': {
      const segs = segsOf(n)
      const w = widthOf(segs)
      return w <= maxW ? { w, h: LH } : { w: maxW, h: wrap(segs, maxW).length * LH }
    }
    case 'Button': {
      const w = widthOf(buttonLabel(n))
      return q.plain ? { w, h: LH } : { w: w + 20, h: 26 }
    }
    case 'Svg':
      return { w: num(q.width) ?? 0, h: num(q.height) ?? 0 }
    case 'Markdown':
      return { w: maxW, h: 26 }
    case 'Code':
      return { w: maxW, h: codeLines(n).length * CODE_LH + 2 * V }
    case 'Client': {
      const c = clientOf(n)
      if (c.module.endsWith('filerows.tsx')) return { w: maxW, h: ((c.props.rows as unknown[]) ?? []).length * LH }
      if (c.module.endsWith('searchbox.tsx')) return { w: maxW, h: LH + 2 * V }
      const line = (c.props.line as Seg[]) ?? []
      return { w: isWide(n) || c.props.isRight ? maxW : widthOf(line), h: LH }
    }
    case 'Box':
      return measureBox(n, maxW)
    default:
      return { w: 0, h: 0 }
  }
}

function measureBox(n: El, maxW: number): Size {
  const q = p(n)
  const pd = pad(n)
  const fixedW = num(q.width) !== undefined ? (num(q.width) ?? 0) * CW : isWide(n) ? maxW : undefined
  const innerMax = (fixedW ?? maxW) - pd.l - pd.r
  const flow = kids(n).filter(k => !isAbsolute(k))
  const layout = q.flexDirection === 'column' ? columnLayout(n, flow, innerMax) : rowLayout(n, flow, innerMax)
  const fixedH = num(q.height) !== undefined ? (num(q.height) ?? 0) * LH : undefined
  return { w: fixedW ?? layout.w + pd.l + pd.r, h: fixedH ?? layout.h + pd.t + pd.b }
}

type Placed = { n: El; x: number; y: number; w: number; h: number }

function columnLayout(n: El, flow: El[], innerW: number) {
  const gap = (num(p(n).gap) ?? num(p(n).rowGap) ?? 0) * V
  const out: Placed[] = []
  let y = 0
  let w = 0
  flow.forEach((k, i) => {
    const m = margin(k)
    const s = measure(k, innerW - m.l - m.r)
    if (i > 0) y += gap
    y += m.t
    out.push({ n: k, x: m.l, y, w: s.w, h: s.h })
    y += s.h + m.b
    w = Math.max(w, s.w + m.l + m.r)
  })
  return { items: out, w, h: y }
}

function rowLayout(n: El, flow: El[], innerW: number) {
  const q = p(n)
  const gap = (num(q.gap) ?? num(q.columnGap) ?? 0) * CW
  const rowGap = (num(q.gap) ?? num(q.rowGap) ?? 0) * V
  const sized = flow.map(k => ({ k, m: margin(k), s: measure(k, innerW) }))
  // Lines: all in one, unless the box wraps and they do not fit.
  const lines: (typeof sized)[] = [[]]
  let used = 0
  for (const it of sized) {
    const w = it.s.w + it.m.l + it.m.r
    const line = lines.at(-1) ?? []
    if (q.flexWrap === 'wrap' && line.length && used + gap + w > innerW) {
      lines.push([it])
      used = w
    } else {
      used += (line.length ? gap : 0) + w
      line.push(it)
    }
  }
  const items: Placed[] = []
  let y = 0
  let wMax = 0
  lines.forEach((line, li) => {
    if (li > 0) y += rowGap
    const total = line.reduce((s, it, i) => s + it.s.w + it.m.l + it.m.r + (i ? gap : 0), 0)
    const growers = line.filter(it => (num(p(it.k).flexGrow) ?? 0) > 0)
    const free = Math.max(0, innerW - total)
    const h = Math.max(0, ...line.map(it => it.s.h + it.m.t + it.m.b))
    let x = 0
    let between = 0
    if (!growers.length) {
      if (q.justifyContent === 'flex-end') x = free
      else if (q.justifyContent === 'center') x = free / 2
      else if (q.justifyContent === 'space-between' && line.length > 1) between = free / (line.length - 1)
    }
    line.forEach((it, i) => {
      if (i > 0) x += gap + between
      const w = it.s.w + (growers.includes(it) ? free / growers.length : 0)
      const ih = it.s.h
      const dy = q.alignItems === 'center' ? (h - ih - it.m.t - it.m.b) / 2 : q.alignItems === 'flex-end' ? h - ih - it.m.b - it.m.t : 0
      items.push({ n: it.k, x: x + it.m.l, y: y + it.m.t + dy, w, h: ih })
      x += it.m.l + w + it.m.r
    })
    wMax = Math.max(wMax, growers.length ? innerW : total)
    y += h
  })
  return { items, w: wMax, h: y }
}

// --- drawing

let embed = 0

// A picture of the mod's own: placed where it falls, its crabs walking (a
// drawing for the pane is a paused still), its animation names its own.
const placeSvg = (source: string, x: number, y: number): string => {
  const k = ++embed
  let s = source.replace(/\n/g, ' ').replace(/ flip"/g, '"').replace(/ style="--t:[\d.]+s"/g, '')
  for (const [, name] of s.matchAll(/@keyframes (gr[\w-]+)/g)) s = s.split(name ?? '').join(`${name}_${k}`)
  return s.replace(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, `<svg x="${x.toFixed(1)}" y="${y.toFixed(1)}"`)
}

// `#### [⌂ work](file:///…) › **src**`: a heading, links quiet, the last step bold.
const markdownLine = (text: string): Seg[] =>
  text
    .replace(/^#+\s*/, '')
    .split(/(\[[^\]]*\]\([^)]*\)|\*\*[^*]+\*\*|`[^`]+`)/)
    .filter(Boolean)
    .map(part => {
      const link = /^\[([^\]]*)\]\(/.exec(part)
      if (link) return { t: link[1] ?? '', dim: true }
      if (part.startsWith('**')) return { t: part.slice(2, -2), b: true }
      if (part.startsWith('`')) return { t: part.slice(1, -1), dim: true }
      return { t: part, dim: true }
    })

function draw(n: El, x: number, y: number, w: number, h: number): string {
  const q = p(n)
  switch (n.type) {
    case 'Text': {
      const segs = segsOf(n)
      const lines = widthOf(segs) <= w + 0.5 ? [segs] : wrap(segs, w)
      return lines.map((line, i) => runs(line, x, baseline(y + i * LH))).join('')
    }
    case 'Button': {
      const label = buttonLabel(n)
      if (q.plain) return runs(label, x, baseline(y, h))
      const isPrimary = q.variant === 'primary'
      const rect = `<rect x="${x}" y="${y}" width="${w.toFixed(1)}" height="${h}" rx="6" class="${isPrimary ? 'b1' : 'b2'}"/>`
      return rect + runs(label.map(s => ({ ...s, cls: isPrimary ? 'b1t' : 'tx' })), x + 10, baseline(y, h))
    }
    case 'Svg':
      return placeSvg(String(q.source ?? ''), x, y)
    case 'Markdown':
      return runs(markdownLine(String(q.text ?? '')), x, baseline(y, 26), 15)
    case 'Client':
      return drawClient(n, x, y, w, h)
    case 'Code': {
      const tone = (l: string) => (l.startsWith('@@') ? ' class="dm"' : l.startsWith('+') ? ' fill="#57ab5a"' : l.startsWith('-') ? ' fill="#e5534b"' : ' class="tx"')
      const lines = codeLines(n)
        .map((l, i) => `<text x="${x + 10}" y="${y + V + (i + 1) * CODE_LH - 4}" font-family="${MONO}" font-size="11.5" xml:space="preserve"${tone(l)}>${xml(l)}</text>`)
        .join('')
      return `<rect x="${x}" y="${y}" width="${w.toFixed(1)}" height="${h}" rx="6" class="b2" opacity=".6"/>${lines}`
    }
    case 'Box':
      return drawBox(n, x, y, w, h)
    default:
      return ''
  }
}

function drawClient(n: El, x: number, y: number, w: number, h: number): string {
  const c = clientOf(n)
  if (c.module.endsWith('filerows.tsx')) {
    const rows = (c.props.rows as { left: Seg[]; right: Seg[] }[]) ?? []
    Object.assign(SHIMMER, (c.props.tones as Record<string, string[]>) ?? {})
    return rows
      .map((r, i) => {
        const ry = y + i * LH
        const rightW = widthOf(r.right)
        const room = Math.max(0, w - rightW - 8)
        let left = r.left
        if (widthOf(left) > room) {
          const name = left.at(-1)
          if (name) left = [...left.slice(0, -1), { ...name, t: fitText(name.t, SIZE, room - widthOf(left.slice(0, -1))) }]
        }
        return runs(left, x, baseline(ry)) + runs(r.right, x + w - rightW, baseline(ry))
      })
      .join('')
  }
  if (c.module.endsWith('searchbox.tsx')) {
    const value = String(c.props.value ?? '')
    const line = `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="8" fill="none" class="fr"/>`
    return line + runs(value ? [{ t: value }] : [{ t: String(c.props.placeholder ?? ''), dim: true }], x + 12, baseline(y, h))
  }
  const line = (c.props.line as Seg[]) ?? []
  const lw = widthOf(line)
  // With a background of its own the region reads as a button.
  const bg = typeof c.props.bg === 'string' ? `<rect x="${x}" y="${y}" width="${w.toFixed(1)}" height="${h}" rx="6" class="b2"/>` : ''
  const lx = c.props.isRight ? x + w - lw : bg ? x + (w - lw) / 2 : x
  return bg + runs(line, lx, baseline(y, Math.min(h, LH)))
}

/** The tree without the elements whose key is listed. */
export function without(tree: unknown, keys: readonly string[]): unknown {
  const e = el(tree)
  if (!e) return tree
  return { ...e, children: (e.children ?? []).filter(c => !keys.includes(String(el(c)?.props?.key ?? ''))).map(c => without(c, keys)) }
}

/** The tree with only the first `n` children of its root. */
export function firstOf(tree: unknown, n: number): unknown {
  const e = el(tree)
  return e ? { ...e, children: (e.children ?? []).slice(0, n) } : tree
}

function drawBox(n: El, x: number, y: number, w: number, h: number): string {
  const q = p(n)
  let out = ''
  if (q.borderStyle) {
    const c = typeof q.borderColor === 'string' ? q.borderColor : '#6b6b68'
    const stroke = NEUTRAL.has(c) ? 'class="fr"' : `stroke="${c}"`
    out += `<rect x="${x + 0.5}" y="${y + 0.5}" width="${(w - 1).toFixed(1)}" height="${(h - 1).toFixed(1)}" rx="8" fill="none" ${stroke} stroke-width="1"/>`
  }
  const pd = pad(n)
  const innerW = w - pd.l - pd.r
  const innerH = h - pd.t - pd.b
  const flow = kids(n).filter(k => !isAbsolute(k))
  const layout = q.flexDirection === 'column' ? columnLayout(n, flow, innerW) : rowLayout(n, flow, innerW)
  for (const it of layout.items) {
    // A column stretches its children across; a Text keeps its own width.
    const isStretched = q.flexDirection === 'column' && it.n.type !== 'Text' && !(it.n.type === 'Button' && !p(it.n).plain) && num(p(it.n).width) === undefined
    out += draw(it.n, x + pd.l + it.x, y + pd.t + it.y, isStretched ? innerW - it.x - margin(it.n).r : it.w, it.h)
  }
  for (const k of kids(n).filter(isAbsolute)) out += draw(k, x + pd.l, y + pd.t, innerW, innerH)
  return out
}

/** The drawn tree as an SVG `width` px wide, framed as a pane on the page. */
export function renderPane(tree: unknown, width: number, opts: { frame?: boolean } = {}): string {
  embed = 0
  shimmerId = 0
  const root = el(tree)
  if (!root) return ''
  const margin = opts.frame === false ? 0 : 16
  const inner = width - 2 * margin
  const s = measure(root, inner)
  const H = Math.ceil(s.h + 2 * margin)
  const body = draw(root, margin, margin, inner, s.h)
  const panel = opts.frame === false ? '' : `<rect width="${width}" height="${H}" rx="14" class="bg"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}">${THEME}${panel}${body}</svg>`
}

/** On one line, non-ASCII as character references, so the console carries it unharmed. */
export const ascii = (s: string): string => s.replace(/\s*\n\s*/g, ' ').replace(/[^\x00-\x7e]/gu, ch => `&#x${(ch.codePointAt(0) ?? 63).toString(16)};`)
