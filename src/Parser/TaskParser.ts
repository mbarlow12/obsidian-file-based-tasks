import {LineTask} from "../Store/TaskStore";
import {RRule} from "rrule";
import {taskTidToId} from "../Task/Task";

// pattern = -/* [x] [something]
const strictPattern = /^\s*[-*] \[(?<complete>\s|x)?]\s+(?<taskLine>(\d|\w)[^^]*)(?: \^(?<tid>[0-9A-Za-z]+))?$/;

export type ParsedTask = Pick<LineTask, 'id'|'name'|'tags'|'recurrence'|'dueDate'|'complete'|'uid'>

const parseTags = (tags: string): string[] => [];
const parseRecurrence = (recurrence: string): RRule | null => null;

export function parseTaskString(line: string): ParsedTask | null {
  const match = line.match(strictPattern);
  if (match) {
    const {complete, taskLine, tid, tags, recurrence, dueDate} = match.groups;
    return {
      uid: taskTidToId(tid),
      complete: complete === 'x',
      name: taskLine.trim(),
      id: tid,
      tags: parseTags(tags),
      recurrence: parseRecurrence(recurrence),
      dueDate: new Date(dueDate)
    };
  }
  else
    return null;
}