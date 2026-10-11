import type { CrewReport, CrewTask } from '../types'

// Progress an agent shows of its own accord: the to-do list it keeps through
// TodoWrite, or through TaskCreate and TaskUpdate. The mod only reads those
// calls, so the bar fills for real without a tool or a token of its own
// (decisions/no-token-cost.md).

type Loose = Record<string, unknown>

/** At most this many tasks are kept, across all agents. */
export const MAX_TASKS = 200

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

/** The progress a list of steps shows: done of all, and the one under way; none for an empty list. */
export function reportOf(steps: readonly { status: Status; activeForm?: string; subject?: string; content?: string }[]): CrewReport | undefined {
  if (!steps.length) return undefined
  const done = steps.filter(s => s.status === 'completed').length
  const note = noteOf(steps.find(s => s.status === 'in_progress'))
  return note ? { done, total: steps.length, note } : { done, total: steps.length }
}

/** A TodoWrite call's progress: the list it writes is the whole list, and an empty one clears it. */
export function todoReport(input: Loose): CrewReport | undefined {
  if (!Array.isArray(input.todos)) return undefined
  const steps = input.todos.flatMap(t => {
    const o = (t ?? {}) as Loose
    const status = statusOf(o.status)
    return status ? [{ status, activeForm: str(o.activeForm), content: str(o.content) }] : []
  })
  return reportOf(steps)
}

/** The id a TaskCreate or TaskUpdate call is about: the result's id, else the subject; the update's `taskId`. */
export function taskIdOf(tool: string, input: Loose, out: Loose | undefined): string {
  if (tool === 'TaskCreate') return str(((out?.task ?? {}) as Loose).id) || str(input.subject)
  return tool === 'TaskUpdate' ? str(input.taskId) : ''
}

/**
 * The session's tasks after a TaskCreate or TaskUpdate call by `agent`. The
 * list is one for all agents, as the engine's is: a new task joins as pending,
 * made by `agent`; an update from any agent changes what it names, its `owner`
 * too; a deleted task leaves. Any other call leaves the list as it was.
 */
export function applyTask(list: readonly CrewTask[], tool: string, input: Loose, out: Loose | undefined, agent: string): CrewTask[] {
  const id = taskIdOf(tool, input, out)
  if (tool === 'TaskCreate') {
    const subject = str(input.subject)
    if (!subject || !id) return [...list]
    const activeForm = str(input.activeForm) || undefined
    return [...list.filter(t => t.id !== id), { id, subject, ...(activeForm ? { activeForm } : {}), status: 'pending' as const, agent }].slice(-MAX_TASKS)
  }
  if (tool === 'TaskUpdate') {
    if (!id || !list.some(t => t.id === id)) return [...list]
    if (input.status === 'deleted') return list.filter(t => t.id !== id)
    return list.map(t => {
      if (t.id !== id) return t
      const next: CrewTask = {
        ...t,
        ...(str(input.subject) ? { subject: str(input.subject) } : {}),
        ...(str(input.activeForm) ? { activeForm: str(input.activeForm) } : {}),
        ...(statusOf(input.status) ? { status: statusOf(input.status) as Status } : {}),
      }
      // A new owner takes the task over; an empty one hands it back to its maker.
      if (typeof input.owner === 'string') {
        const owner = str(input.owner)
        if (owner) next.owner = owner
        else delete next.owner
      }
      return next
    })
  }
  return [...list]
}

/** Whose a task is: its owner's, resolved to an agent by `resolve`, else its maker's. */
export const holderOf = (t: CrewTask, resolve: (owner: string) => string): string => (t.owner ? resolve(t.owner) : t.agent)

/** The progress of the tasks `holder` has. */
export const tasksReport = (list: readonly CrewTask[], holder: string, resolve: (owner: string) => string): CrewReport | undefined =>
  reportOf(list.filter(t => holderOf(t, resolve) === holder))

/** Whether a call is one of the to-do tools this module reads. */
export const isTodoTool = (tool: string): boolean => tool === 'TodoWrite' || tool === 'TaskCreate' || tool === 'TaskUpdate'
