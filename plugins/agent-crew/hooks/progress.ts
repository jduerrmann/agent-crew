import type { CrewReport, CrewTask } from '../types'

// Progress an agent shows of its own accord: the to-do list it keeps through
// TodoWrite, or through TaskCreate and TaskUpdate. The mod only reads those
// calls, so the bar fills for real without a tool or a token of its own
// (decisions/no-token-cost.md).

type Loose = Record<string, unknown>

/** At most this many tasks are kept per agent. */
export const MAX_TASKS = 40

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const STATUSES = ['pending', 'in_progress', 'completed'] as const
type Status = (typeof STATUSES)[number]
const statusOf = (v: unknown): Status | undefined => STATUSES.find(s => s === v)

/** A step's line is cut to this many characters, as a `step` report's note is. */
const MAX_NOTE = 80

// A step's line, on one line: what it is doing, else what it is.
const noteOf = (item: { activeForm?: string; subject?: string; content?: string } | undefined): string | undefined => {
  const text = item ? (str(item.activeForm) || str(item.subject) || str(item.content)).replace(/\s+/g, ' ') : ''
  if (!text) return undefined
  return [...text].length > MAX_NOTE ? `${[...text].slice(0, MAX_NOTE - 1).join('')}…` : text
}

/** The progress a list of steps shows: done of all, and the one under way. */
export function reportOf(steps: readonly { status: Status; activeForm?: string; subject?: string; content?: string }[]): CrewReport | undefined {
  if (!steps.length) return undefined
  const done = steps.filter(s => s.status === 'completed').length
  const note = noteOf(steps.find(s => s.status === 'in_progress'))
  return note ? { done, total: steps.length, note } : { done, total: steps.length }
}

/** A TodoWrite call's progress: the list it writes is the whole list. */
export function todoReport(input: Loose): CrewReport | undefined {
  if (!Array.isArray(input.todos)) return undefined
  const steps = input.todos.flatMap(t => {
    const o = (t ?? {}) as Loose
    const status = statusOf(o.status)
    return status ? [{ status, activeForm: str(o.activeForm), content: str(o.content) }] : []
  })
  return reportOf(steps)
}

/**
 * An agent's tasks after a TaskCreate or TaskUpdate call: a new one joins as
 * pending (its id from the result, else its subject), an update changes what it
 * names, a deleted one leaves. Any other call leaves the list as it was.
 */
export function applyTask(list: readonly CrewTask[], tool: string, input: Loose, out: Loose | undefined): CrewTask[] {
  if (tool === 'TaskCreate') {
    const subject = str(input.subject)
    if (!subject) return [...list]
    const task = (out?.task ?? {}) as Loose
    const id = str(task.id) || subject
    const activeForm = str(input.activeForm) || undefined
    return [...list.filter(t => t.id !== id), { id, subject, ...(activeForm ? { activeForm } : {}), status: 'pending' as const }].slice(-MAX_TASKS)
  }
  if (tool === 'TaskUpdate') {
    const id = str(input.taskId)
    if (!id || !list.some(t => t.id === id)) return [...list]
    if (input.status === 'deleted') return list.filter(t => t.id !== id)
    return list.map(t =>
      t.id !== id
        ? t
        : {
            ...t,
            ...(str(input.subject) ? { subject: str(input.subject) } : {}),
            ...(str(input.activeForm) ? { activeForm: str(input.activeForm) } : {}),
            ...(statusOf(input.status) ? { status: statusOf(input.status) as Status } : {}),
          },
    )
  }
  return [...list]
}

/** Whether a call is one of the to-do tools this module reads. */
export const isTodoTool = (tool: string): boolean => tool === 'TodoWrite' || tool === 'TaskCreate' || tool === 'TaskUpdate'
