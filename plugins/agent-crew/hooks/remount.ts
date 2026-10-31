// A Client the host gave up on (`ui.fault`: a render that never answered while
// the app was busy, a throw) shows the host's error under its key until a
// reload. Each fault gives the key a new generation, so the next drawing mounts
// a fresh instance there; a few times per key, so a module that always fails
// cannot loop (limits/client-fault-sticks.md).

/** New instances one key gets at most. */
export const MAX_REMOUNTS = 5
/** Keys remembered at most; the oldest goes first. */
const MAX_KEYS = 200

/** The key a drawn Client's key stands for: `rowhit-a1~2` is `rowhit-a1`. */
export const baseKey = (key: string): string => key.replace(/~\d+$/, '')

export type Remounts = {
  /** A Client's key as drawn: its own, or after a fault a fresh one. */
  key: (key: string) => string
  /** Hears a fault of the Client drawn under `element`. */
  fault: (element: string) => void
}

export const remounts = (): Remounts => {
  const gen = new Map<string, number>()
  return {
    key: key => {
      const n = gen.get(key) ?? 0
      return n ? `${key}~${n}` : key
    },
    fault: element => {
      const key = baseKey(element)
      const n = gen.get(key) ?? 0
      if (n >= MAX_REMOUNTS) return
      gen.set(key, n + 1)
      if (gen.size > MAX_KEYS) gen.delete(gen.keys().next().value ?? key)
    },
  }
}
