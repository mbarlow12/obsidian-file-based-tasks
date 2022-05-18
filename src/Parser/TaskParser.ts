import { RRule } from "rrule";
import { TaskInstance } from '../Task';
import { taskIdToUid } from "../Task/Task";

// pattern = -/* [x] [something]
const strictPattern = /^\s*[-*] \[(?<complete>\s|x)?]\s+(?<taskLine>(\d|\w)[^^]*)(?: \^(?<id>[0-9A-Za-z]+))?$/;

export type ParsedTask = Pick<TaskInstance, 'id'|'name'|'tags'|'recurrence'|'dueDate'|'complete'|'uid'|'rawText'>

const parseTags = (tags: string): string[] => [];
const parseRecurrence = (recurrence: string): RRule | null => null;

export function parseTaskString(line: string): ParsedTask | null {
  const match = line.match(strictPattern);
  if (match) {
    const {complete, taskLine, id: id, tags, recurrence, dueDate} = match.groups;
    return {
      uid: taskIdToUid(id),
      complete: complete === 'x',
      name: taskLine.trim(),
      id: id || '',
      rawText: line,
      ...(tags && {tags: parseTags(tags) }),
      ...(recurrence &&{recurrence: parseRecurrence(recurrence)}),
      ...(dueDate && {dueDate: new Date(dueDate)})
    };
  }
  else
    return null;
}