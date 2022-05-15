import {FileTaskLine, Task} from "../Task";

// pattern = -/* [x] [something]
const strictPattern = /^\s*[-*] \[(?<complete>\s|x)?]\s+(?<taskLine>(\d|\w)[^^]*)(?: \^(?<tid>[0-9A-Za-z]+))?$/;

export function parseLine(line: string): Task | null {
  const match = line.match(strictPattern);
  if (match) {
    const {complete, taskLine, tid} = match.groups;
    return {
      childTids: [], description: "", locations: [], parentTids: [], tags: [],
      complete: complete === 'x',
      name: taskLine.trim(),
      id: tid
    };
  } else
    return null;
}

export default class TaskParser {
  static parseLines(contents: string): Array<FileTaskLine> {
    const lines = contents.split(/\r?\n/g);
    return lines.map((line, index) => {
      return [index, parseLine(line)] as FileTaskLine
    }).filter(tl => tl[1] !== null);
  }
}
