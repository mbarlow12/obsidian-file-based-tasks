import * as chrono from "chrono-node";
import { RRule } from "rrule";
import { TaskInstance } from '../Task';
import { taskIdToUid } from "../Task/Task";

export interface ParserSettings {
  tokens: {
    tag: string,
    recurrence: string;
    dueDate: string;
    divider: string;
  };
  prefix: string;
}

// (\-|\*) \[ \] (?<taskInfo>[^\^\r\n]+)
// pattern = -/* [x] [something]
export const DEFAULT_PARSER_SETTINGS: ParserSettings = {
  tokens: {
    tag: '#',
    recurrence: '&',
    dueDate: '@',
    divider: '|*|'
  },
  prefix: ''
};
const strictPattern = /^\s*[-*] \[(?<complete>\s|x)?]\s+(?<taskLine>(\d|\w)[^^]*)(?:[ \t]\^(?<id>[\w\d]+))?$/;
export type ParsedTask = Pick<TaskInstance, 'id'|'name'|'tags'|'recurrence'|'dueDate'|'complete'|'uid'|'rawText'|'links'>

// const parseTags = (tags: string): string[] => [];
const parseRecurrence = (recurrence: string): RRule | null => {
  try {
    return RRule.fromText(recurrence);
  }
  catch (e)  {
    console.log(e);
    return null
  }
}
const parseDueDate = (dueDate: string): Date | null => chrono.parseDate(dueDate);

// export function parseTaskString(line: string): ParsedTask | null {
//   const match = line.match(strictPattern);
//   if (match) {
//     const {complete, taskLine, id: id, tags, recurrence, dueDate} = match.groups;
//     return {
//       uid: taskIdToUid(id),
//       complete: complete === 'x',
//       name: taskLine.trim(),
//       id: id || '',
//       rawText: line,
//       ...(tags && {tags: parseTags(tags) }),
//       ...(recurrence &&{recurrence: parseRecurrence(recurrence)}),
//       ...(dueDate && {dueDate: new Date(dueDate)})
//     };
//   }
//   else
//     return null;
// }

export class TaskParser {
  private settings: ParserSettings;
  private static LINK_REGEX = /\[\[[^\]]+\]\]/g;
  private static LINE_REGEX = /^\s*[-*] \[(?<complete>\s|x)?]\s+(?<taskLine>(?:\d|\w).*)$/;
  private static ID_REGEX = /\^[\w\d]+$/;

  constructor(settings = DEFAULT_PARSER_SETTINGS) {
    this.settings = settings;
  }

  updateSettings(settings: ParserSettings) {
    this.settings = settings;
  }

  parseLine( line: string ): ParsedTask {
    const lineMatch = line.match(TaskParser.LINE_REGEX);
    if (lineMatch) {
      const {taskLine, complete} = lineMatch.groups;
      const idMatch = taskLine.match(TaskParser.ID_REGEX);
      const id = (idMatch && idMatch.length && this.stripIdToken(idMatch[0])) || '';
      const pTask: ParsedTask = {
        id,
        uid: taskIdToUid(id),
        complete: complete === 'x',
        name: '',
        rawText: line,
      }
      const tags = taskLine.match(this.tagRegex) || [];
      if (tags.length)
        pTask.tags = tags.map(t => this.stripTagToken(t));
      const recurrenceMatches = taskLine.match(this.recurrenceRegex) || [];
      const recurrence = recurrenceMatches.length && parseRecurrence(this.stripRecurrenceToken(recurrenceMatches[0]));
      if (recurrence)
        pTask.recurrence = recurrence;
      const dueDateMatches = taskLine.match(this.dueDateRegex) || [];
      const dueDate = dueDateMatches.length && parseDueDate(this.stripDueDateToken(dueDateMatches[0]));
      if (dueDate)
        pTask.dueDate = dueDate;
      const linkMatches = taskLine.match(TaskParser.LINK_REGEX);
      if (linkMatches &&  lineMatch.length)
        pTask.links = linkMatches.map(l => this.stripLinkToken(l));
      pTask.name = taskLine.replace(this.tagRegex, '')
          .replace(TaskParser.ID_REGEX, '')
          .replace(this.recurrenceRegex, '')
          .replace(this.dueDateRegex, '')
          .replace(TaskParser.LINK_REGEX, '').trim();
      return pTask;
    }
    else
      return null;
  }

  get namePattern() {
    return `^${this.negatedPattern}`;
  }

  get nameRegex() {
    return new RegExp(this.namePattern);
  }

  get negatedPattern() {
    const {tag, dueDate, recurrence} = this.settings.tokens;
    return `(?:[^${tag}${dueDate}${recurrence}\\[\\^]|)+`
  }

  get negatedRegex() {
    return new RegExp(this.negatedPattern)
  }

  get tagPattern() {
    const { tag, dueDate, recurrence } = this.settings.tokens;
    const negatedTokens = [tag, dueDate, recurrence, '\\s', '\\[', '\\^'];
    return `${tag}[^${negatedTokens.join('')}]+`;
  }

  get tagRegex() {
    return new RegExp(this.tagPattern, 'g');
  }

  stripTagToken(s: string) {
    return this.stripToken(s, this.settings.tokens.tag);
  }

  get recurrencePattern() {
    const { recurrence } = this.settings.tokens;
    return this.getTokenPattern(recurrence);
  }

  get recurrenceRegex() {
    return new RegExp(this.recurrencePattern, 'g');
  }

  stripRecurrenceToken(s: string) {
    return this.stripToken(s, this.settings.tokens.recurrence);
  }

  get dueDatePattern() {
    const { dueDate } = this.settings.tokens;
    return this.getTokenPattern( dueDate );
  }

  get dueDateRegex() {
    return new RegExp(this.dueDatePattern, 'g');
  }

  stripDueDateToken(s: string) {
    return this.stripToken(s, this.settings.tokens.dueDate);
  }

  stripLinkToken(s: string) {
    return s.replace(/[[\]]/g, '');
  }

  stripIdToken(s: string) {
    return s.replace(/\^/g, '');
  }

  getTokenPattern( token: string ) {
    return `${token}${this.negatedPattern}`;
  }

  stripToken(s: string, token: string) {
    return s.replace(new RegExp(token, 'g'), '');
  }

}