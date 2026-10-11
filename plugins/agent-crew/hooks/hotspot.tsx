import type { ClientModule, RenderElement } from 'claude-code'

// A region on the cell grid that takes presses, draws a few segments of text
// and may let one pulse. The desktop rebuilds the pane on every redraw, several
// a second while a crab walks: a Button pressed across a redraw loses its click,
// and a picture's animation starts over. A Client keeps its state and its timer
// through redraws and posts on the press itself, as the file rows do, so its
// clicks land and its pulse runs on.

export type HotSeg = { t: string; c?: string; b?: boolean; dim?: boolean; pulse?: boolean }
export type HotspotProps = {
  /** Posted as `{ press: id }` on a left press; absent, the region takes none. */
  id?: string
  /** One line of segments, or none; set to the right with `isRight`. */
  line?: HotSeg[]
  isRight?: boolean
  /** The region's background while the pointer is over it. */
  hoverBg?: string
}
type Local = { hover: boolean; phase: number; ref: { stop?: () => void } }

const TICK_MS = 80
const BEAT_MS = 1600
// Halfway through a beat a pulsing segment has faded this far towards grey.
const FADE = 0.65
const GREY = [0x8a, 0x8a, 0x86] as const

// `#rrggbb`, or the short `#rgb`.
const rgb = (hex: string): number[] => {
  const raw = hex.replace('#', '')
  const h = raw.length === 3 ? [...raw].map(c => c + c).join('') : raw
  return [0, 2, 4].map(i => Number.parseInt(h.slice(i, i + 2), 16) || 0)
}

// The colour a share `t` of the way from `hex` to grey.
const toward = (hex: string, t: number): string =>
  `#${rgb(hex)
    .map((c, i) => Math.round(c + ((GREY[i] ?? c) - c) * t).toString(16).padStart(2, '0'))
    .join('')}`

const Hotspot: ClientModule<HotspotProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  let state = surface.state
  if (state === undefined) {
    state = { hover: false, phase: 0, ref: {} }
    surface.setState(state)
  }
  const pulses = (props.line ?? []).some(s => s.pulse && s.c)
  if (pulses && !state.ref.stop) {
    state.ref.stop = surface.every(TICK_MS, () => {
      const cur = surface.state
      if (cur) surface.setState({ ...cur, phase: (cur.phase + 1) % (BEAT_MS / TICK_MS) })
    })
  } else if (!pulses && state.ref.stop) {
    state.ref.stop()
    state.ref.stop = undefined
  }

  surface.onPointer(e => {
    const cur = surface.state ?? state
    const isIn = e.type !== 'leave' && e.x >= 0 && e.y >= 0 && e.x < surface.columns && e.y < surface.rows
    if (cur.hover !== isIn) surface.setState({ ...cur, hover: isIn })
    // On the press itself, not the release: a release can fall into the next
    // redraw and be lost, so there is no dragging off to cancel, as on the file rows.
    if (e.type === 'down' && (e.button ?? 'left') === 'left' && props.id) surface.post({ press: props.id })
  })
  // With the keys, Enter or Space press it as a Button would.
  surface.onKey(k => {
    if (props.id && (k.key === 'return' || k.key === ' ' || k.key === 'space')) surface.post({ press: props.id })
  })

  // Out and back once a beat, easing at both ends.
  const t = (1 - Math.cos(((state.phase * TICK_MS) / BEAT_MS) * 2 * Math.PI)) / 2
  const draw = (s: HotSeg, k: string): RenderElement => (
    <Text key={k} color={s.pulse && s.c ? toward(s.c, t * FADE) : s.c} bold={s.b} dimColor={s.dim}>
      {s.t}
    </Text>
  )
  return (
    <Box
      flexDirection="row"
      width="100%"
      height="100%"
      justifyContent={props.isRight ? 'flex-end' : 'flex-start'}
      alignItems="flex-start"
      backgroundColor={state.hover && props.hoverBg ? props.hoverBg : undefined}
    >
      <Text>{(props.line ?? []).map((s, i) => draw(s, `s${i}`))}</Text>
    </Box>
  )
}

export default Hotspot
