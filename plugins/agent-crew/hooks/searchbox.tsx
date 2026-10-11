import type { ClientModule } from 'claude-code'

// The file tree's search field, drawn on the cell grid so it spans the frame and
// carries no submit button: a click gives it the keys, every edit posts
// `{ query }`, Enter `{ submit }`, the × at the right `{ query: '' }`.

export type SearchBoxProps = { value: string; placeholder: string; hits: string; line: string; accent: string }
type Local = { text: string; synced: string; isFocused: boolean }

const SearchBox: ClientModule<SearchBoxProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  let state = surface.state
  if (state === undefined) {
    state = { text: props.value, synced: props.value, isFocused: false }
    surface.setState(state)
  } else if (props.value !== state.synced) {
    // The plugin changed the query (the ×, a cleared filter): take it.
    state = { ...state, text: props.value, synced: props.value }
    surface.setState(state)
  }

  const edit = (text: string) => {
    const cur = surface.state ?? state
    surface.setState({ ...cur, text, synced: text })
    surface.post({ query: text })
  }

  surface.onPointer(e => {
    if (e.type !== 'down' || (e.button ?? 'left') !== 'left') return
    const cur = surface.state ?? state
    if (cur.text && e.x >= surface.columns - 4) edit('')
    else if (!cur.isFocused) surface.setState({ ...cur, isFocused: true })
  })

  surface.onKey(e => {
    const cur = surface.state ?? state
    if (!cur.isFocused) surface.setState({ ...cur, isFocused: true })
    if (e.key === 'return') surface.post({ submit: cur.text })
    else if (e.key === 'backspace') edit([...cur.text].slice(0, -1).join(''))
    else if (e.key === 'space') edit(cur.text + ' ')
    else if ([...e.key].length === 1 && !e.ctrl && !e.meta) edit(cur.text + e.key)
  })

  const tail = state.text ? `${props.hits}  ×` : ''
  return (
    <Box borderStyle="round" borderColor={state.isFocused ? props.accent : props.line} paddingX={1} flexDirection="row">
      <Box flexGrow={1} flexShrink={1} overflow="hidden">
        {state.text ? (
          <Text wrap="truncate-start">
            {state.text}
            {state.isFocused ? <Text color={props.accent}>▏</Text> : null}
          </Text>
        ) : (
          <Text dimColor wrap="truncate-end">
            {state.isFocused ? <Text color={props.accent}>▏</Text> : null}
            {props.placeholder}
          </Text>
        )}
      </Box>
      {tail ? <Text dimColor>{tail}</Text> : null}
    </Box>
  )
}

export default SearchBox
