import type { ClientModule } from 'claude-code'

// The file tree's search field, drawn on the cell grid so it spans the frame and
// carries no submit button: a click gives it the keys and posts `{ focus }`,
// every edit `{ query }`, Enter `{ submit }`, the × at the right `{ query: '' }`.
//
// A region never hears that it lost the keys, so whether it looks focused is the
// hooks module's to say (`isFocused`): it clears that when the person types in
// the prompt or presses anything else in the pane.

export type SearchBoxProps = { value: string; placeholder: string; hits: string; line: string; accent: string; isFocused: boolean }
// `posted`: the values sent and not yet seen back. Keys typed faster than a round
// trip make the plugin's props trail the field; an older one coming back is an
// echo, not a change, and must not wind the text back and lose a key.
type Local = { text: string; synced: string; posted: string[] }

const SearchBox: ClientModule<SearchBoxProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  let state = surface.state
  if (state === undefined) {
    state = { text: props.value, synced: props.value, posted: [] }
    surface.setState(state)
  } else if (props.value !== state.synced) {
    const at = state.posted.indexOf(props.value)
    if (at >= 0) {
      // An echo of something typed: drop it and what came before, keep the text.
      state = { ...state, synced: props.value, posted: state.posted.slice(at + 1) }
    } else {
      // The plugin changed the query (the ×, a cleared filter): take it.
      state = { ...state, text: props.value, synced: props.value, posted: [] }
    }
    surface.setState(state)
  }

  const edit = (text: string) => {
    const cur = surface.state ?? state
    surface.setState({ ...cur, text, posted: [...cur.posted, text].slice(-20) })
    // One post a frame reaches the hooks: a key proves the focus, so it rides along.
    surface.post({ query: text, focus: true })
  }

  surface.onPointer(e => {
    if (e.type !== 'down' || (e.button ?? 'left') !== 'left') return
    const cur = surface.state ?? state
    if (cur.text && e.x >= surface.columns - 4) edit('')
    else if (!props.isFocused) surface.post({ focus: true })
  })

  surface.onKey(e => {
    const cur = surface.state ?? state
    if (e.key === 'return') surface.post({ submit: cur.text, focus: true })
    else if (e.key === 'backspace') edit([...cur.text].slice(0, -1).join(''))
    else if (e.key === 'space') edit(cur.text + ' ')
    else if ([...e.key].length === 1 && !e.ctrl && !e.meta) edit(cur.text + e.key)
  })

  const tail = state.text ? `${props.hits}  ×` : ''
  return (
    <Box borderStyle="round" borderColor={props.isFocused ? props.accent : props.line} paddingX={1} flexDirection="row">
      <Box flexGrow={1} flexShrink={1} overflow="hidden">
        {state.text ? (
          <Text wrap="truncate-start">
            {state.text}
            {props.isFocused ? <Text color={props.accent}>▏</Text> : null}
          </Text>
        ) : (
          <Text dimColor wrap="truncate-end">
            {props.isFocused ? <Text color={props.accent}>▏</Text> : null}
            {props.placeholder}
          </Text>
        )}
      </Box>
      {tail ? <Text dimColor>{tail}</Text> : null}
    </Box>
  )
}

export default SearchBox
