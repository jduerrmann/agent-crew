import type { ClientModule, RenderElement } from 'claude-code'

// The file tree's rows on the cell grid, after filetree's hooks/rows.tsx (Kurt
// Buhler, MIT): one row a line, the hovered one lit, a fresh name shimmering
// letter by letter. A click anywhere on a row posts `{ press: id }` to the hooks
// module, so a row takes presses while it shimmers.

export type Seg = { t: string; c?: string; b?: boolean; dim?: boolean; sh?: string }
// `isOpen` on a folder: whether it is drawn open, so a press shuts what shows open.
export type FileRowSpec = { id: string; isOpen?: boolean; left: Seg[]; right: Seg[] }
export type FileRowsProps = { rows: FileRowSpec[]; tones: Record<string, string[]>; hoverBg: string }
type Local = { hover: number; phase: number; ref: { stop?: () => void } }

const TICK_MS = 90

// A bright band runs along the name: the crest, its shoulders, then the base.
function shimmer(i: number, phase: number, len: number, palette: string[]): string {
  const band = ((phase * 1.6) % (len + 8)) - 4
  const d = Math.abs(i - band)
  return palette[d < 0.8 ? 3 : d < 1.8 ? 2 : d < 2.8 ? 1 : 0] ?? palette[0] ?? '#f97316'
}

const FileRows: ClientModule<FileRowsProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  let state = surface.state
  if (state === undefined) {
    state = { hover: -1, phase: 0, ref: {} }
    surface.setState(state)
  }
  const lit = props.rows.some(r => r.left.some(s => s.sh))
  if (lit && !state.ref.stop) {
    state.ref.stop = surface.every(TICK_MS, () => {
      const cur = surface.state
      if (cur) surface.setState({ ...cur, phase: cur.phase + 1 })
    })
  } else if (!lit && state.ref.stop) {
    state.ref.stop()
    state.ref.stop = undefined
  }

  surface.onPointer(e => {
    const cur = surface.state ?? state
    if (e.type === 'leave' || e.y < 0 || e.y >= props.rows.length) {
      if (cur.hover !== -1) surface.setState({ ...cur, hover: -1 })
      return
    }
    if (e.type === 'move' && !e.button && cur.hover !== e.y) surface.setState({ ...cur, hover: e.y })
    const row = props.rows[e.y]
    if (e.type === 'down' && (e.button ?? 'left') === 'left' && row) surface.post(row.isOpen === undefined ? { press: row.id } : { press: row.id, isOpen: row.isOpen })
  })

  const draw = (s: Seg, k: string): RenderElement => {
    const palette = s.sh ? props.tones[s.sh] : undefined
    if (!palette) {
      return (
        <Text key={k} color={s.c} bold={s.b} dimColor={s.dim}>
          {s.t}
        </Text>
      )
    }
    const chars = [...s.t]
    return (
      <Text key={k} bold={s.b}>
        {chars.map((ch, i) => (
          <Text key={`${k}-${i}`} color={shimmer(i, state.phase, chars.length, palette)}>
            {ch}
          </Text>
        ))}
      </Text>
    )
  }

  return (
    <Box flexDirection="column">
      {props.rows.map((r, i) => (
        <Box key={r.id} flexDirection="row" height={1} overflow="hidden" backgroundColor={i === state.hover ? props.hoverBg : undefined}>
          <Box flexShrink={1} overflow="hidden">
            <Text wrap="truncate-end">{r.left.map((s, j) => draw(s, `l${j}`))}</Text>
          </Box>
          <Box flexGrow={1} />
          <Text>{r.right.map((s, j) => draw(s, `r${j}`))}</Text>
        </Box>
      ))}
    </Box>
  )
}

export default FileRows
