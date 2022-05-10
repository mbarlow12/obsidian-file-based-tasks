import {
  App,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  Instruction,
  TFile
} from "obsidian";
import {ITask} from "./Task";
import {TaskIndex} from "./TaskIndex";


export class TaskEditorSuggest implements EditorSuggest<ITask>{
  static taskLinePattern = /(-|\*) \[(\s|x)?\]/
  static pattern =  /(?:-|\*) \[(\s|x)?\]\s+[^\r\n]+(?!\|\|)$/gm;

  context: EditorSuggestContext | null;
  limit: number;
  app: App;
  taskIndex: TaskIndex;

  constructor(app: App, tfm: TaskIndex) {
    this.app = app;
    this.taskIndex = tfm;
  }

  close(): void {
  }

  getSuggestions(context: EditorSuggestContext): ITask[] | Promise<ITask[]> {
    const search = context.query;
    return this.taskIndex.getAllTasks().filter(t => t.name.startsWith(search));
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line);
    if (!line.match(TaskEditorSuggest.taskLinePattern))
      return null;

    const match = line.match(TaskEditorSuggest.pattern);
    if (match) {
      const start = line.indexOf(match[1]);
      return {
        start: {
          line: cursor.line,
          ch: start
        },
        end: cursor,
        query: match[1].trim()
      }
    }

    return null;
  }

  open(): void {
  }

  renderSuggestion(value: ITask, el: HTMLElement): void {
  }

  selectSuggestion(value: ITask, evt: MouseEvent | KeyboardEvent): void {
  }

  setInstructions(instructions: Instruction[]): void {
  }
}