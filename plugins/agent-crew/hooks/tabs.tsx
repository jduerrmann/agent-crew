import type { ClientModule, RenderElement } from 'claude-code'

// Browser-style tabs on the cell grid: rounded tops, the active tab open at the
// bottom so it runs into the content line, the hovered one lit. A click posts
// `{ tab }` to the hooks module.
//
//  ╭───────────╮╭────────────╮
//  │ ● Aktiv 2 ││ ✓ Fertig 5 │
//  ╯           ╰┴────────────┴──────────────

export type Tab = { id: string; icon: string; label: string; count: number; color: string }
export type TabsProps = { tabs: Tab[]; active: string; line: string; dim: string }
type Local = { hover: number }

const GUTTER = 1

const labelOf = (t: Tab): string => ` ${t.icon} ${t.label} ${t.count} `

// The column span [from, to) each tab takes, after the gutter.
const spans = (tabs: Tab[]): [number, number][] => {
  let x = GUTTER
  return tabs.map(t => {
    const w = [...labelOf(t)].length + 2
    const span: [number, number] = [x, x + w]
    x += w
    return span
  })
}

const Tabs: ClientModule<TabsProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  const state = surface.state ?? { hover: -1 }
  const at = spans(props.tabs)
  const hit = (x: number, y: number) => (y >= 0 && y <= 2 ? at.findIndex(([a, b]) => x >= a && x < b) : -1)

  surface.onPointer(e => {
    const cur = surface.state ?? { hover: -1 }
    if (e.type === 'leave') {
      if (cur.hover !== -1) surface.setState({ hover: -1 })
      return
    }
    const i = hit(e.x, e.y)
    if (e.type === 'move' && i !== cur.hover) surface.setState({ hover: i })
    if (e.type === 'down' && (e.button ?? 'left') === 'left' && i >= 0) {
      const tab = props.tabs[i]
      if (tab && tab.id !== props.active) surface.post({ tab: tab.id })
    }
  })

  const used = at.at(-1)?.[1] ?? GUTTER
  const tail = Math.max(0, surface.columns - used)
  const top: RenderElement[] = [<Text key="t-g">{' '.repeat(GUTTER)}</Text>]
  const mid: RenderElement[] = [<Text key="m-g">{' '.repeat(GUTTER)}</Text>]
  const bottom: RenderElement[] = [
    <Text key="b-g" color={props.line}>
      {'─'.repeat(GUTTER)}
    </Text>,
  ]

  props.tabs.forEach((t, i) => {
    const isActive = t.id === props.active
    const isHover = i === state.hover && !isActive
    const inner = [...labelOf(t)].length
    const edge = isActive ? t.color : isHover ? props.line : props.dim
    top.push(
      <Text key={`t-${t.id}`} color={edge}>
        {`╭${'─'.repeat(inner)}╮`}
      </Text>,
    )
    mid.push(
      <Text key={`m-${t.id}`}>
        <Text color={edge}>│</Text>
        <Text color={isActive ? t.color : undefined} bold={isActive} dimColor={!isActive && !isHover}>
          {` ${t.icon} `}
        </Text>
        <Text bold={isActive} dimColor={!isActive && !isHover}>
          {t.label}
        </Text>
        <Text color={isActive ? t.color : undefined} dimColor={!isActive}>
          {` ${t.count} `}
        </Text>
        <Text color={edge}>│</Text>
      </Text>,
    )
    bottom.push(
      isActive ? (
        <Text key={`b-${t.id}`} color={t.color}>
          {`╯${' '.repeat(inner)}╰`}
        </Text>
      ) : (
        <Text key={`b-${t.id}`} color={props.line}>
          {`┴${'─'.repeat(inner)}┴`}
        </Text>
      ),
    )
  })
  bottom.push(
    <Text key="b-tail" color={props.line}>
      {'─'.repeat(tail)}
    </Text>,
  )

  return (
    <Box flexDirection="column">
      <Text wrap="truncate-end">{top}</Text>
      <Text wrap="truncate-end">{mid}</Text>
      <Text wrap="truncate-end">{bottom}</Text>
    </Box>
  )
}

export default Tabs
