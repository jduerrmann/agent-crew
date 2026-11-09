// When a plan limit fills at the current pace. The engine reports a limit's
// percentage after each main-thread turn (usage-arrives-late); a short history of
// those readings gives the pace, and the pace the time left. Nothing here calls a
// model (tokens-only-on-the-persons-send).

/** One limit's recent readings: its window (when it resets) and `[at, percent]` samples, oldest first. */
export type LimitHistory = { window?: string; samples: [number, number][] }

/** Samples older than this are dropped. */
export const KEEP_MS = 2 * 3_600_000
export const MAX_SAMPLES = 60
/** The pace is read over about the last half hour. */
export const PACE_MS = 30 * 60_000
/** Two readings closer than this give no pace worth telling. */
export const MIN_SPAN_MS = 3 * 60_000
/**
 * A rise of fewer points gives no pace: the engine's percentages can come as
 * whole numbers, so a step of one or two may be rounding alone (a weekly limit
 * ticking from 25 to 26 % within minutes once forecast it full in four hours).
 */
export const MIN_RISE = 3
/** What rounding can add to a rise between two readings, taken off it. */
const ROUNDING = 1
/** A newest reading older than this no longer says how fast things go now. */
export const STALE_MS = 30 * 60_000
/** Readings closer together than this replace the newest instead of adding one. */
const STEP_MS = 60_000

// Two reset times name the same window when they lie within a minute: the engine
// may compute them afresh each time. A missing one says nothing either way.
const sameWindow = (a?: string, b?: string): boolean => {
  if (!a || !b) return true
  const d = Math.abs(Date.parse(a) - Date.parse(b))
  return Number.isFinite(d) ? d < 60_000 : a === b
}

/**
 * The history with a new reading. A new window, or a percentage that fell (the
 * window was reset), starts the history over. Kept readings lie at least a
 * minute apart: the newest floats, replaced by the next one until it is a minute
 * past the one before it, so a busy stretch of turns doesn't crowd the history.
 */
export function addSample(h: LimitHistory | undefined, percent: number, resetsAt: string | undefined, at: number): LimitHistory {
  const last = h?.samples.at(-1)
  const isNew = !h || !sameWindow(h.window, resetsAt) || (last !== undefined && percent < last[1] - 0.5)
  const samples = isNew || !h ? [] : h.samples.filter(s => at - s[0] <= KEEP_MS)
  const newest = samples.at(-1)
  const before = samples.at(-2)
  if (newest && before && newest[0] - before[0] < STEP_MS) samples.pop()
  samples.push([at, percent])
  return { window: resetsAt ?? h?.window, samples: samples.slice(-MAX_SAMPLES) }
}

/**
 * How long until the limit is full at the pace of about the last half hour, in
 * ms from `at`; undefined without a rise of `MIN_RISE` points in the history,
 * with stale readings, or when it is full already. At least a minute.
 */
export function fullIn(h: LimitHistory | undefined, at: number): number | undefined {
  const s = h?.samples ?? []
  const newest = s.at(-1)
  if (!newest || s.length < 2 || newest[1] >= 100 || at - newest[0] > STALE_MS) return undefined
  const ago = (x: [number, number]) => newest[0] - x[0]
  // Readings far enough back and far enough below the newest, oldest first. The
  // oldest of the last half hour, else, where that half hour rose too little, the
  // newest before it: a slow limit is read over a longer stretch.
  const usable = s.slice(0, -1).filter(x => ago(x) >= MIN_SPAN_MS && newest[1] - x[1] >= MIN_RISE)
  const anchor = usable.find(x => ago(x) <= PACE_MS) ?? usable.at(-1)
  if (!anchor) return undefined
  // Taken off the rise, rounding can only make the forecast later, never sooner.
  const rise = newest[1] - anchor[1] - ROUNDING
  return Math.max(60_000, ((100 - newest[1]) / rise) * ago(anchor) - (at - newest[0]))
}

/** Whether a limit full in `ms` fills before it resets: only then is the forecast worth showing. */
export function fillsBeforeReset(ms: number, resetsAt: string | undefined, at: number): boolean {
  const reset = resetsAt ? Date.parse(resetsAt) : Number.NaN
  return !Number.isFinite(reset) || at + ms < reset
}
