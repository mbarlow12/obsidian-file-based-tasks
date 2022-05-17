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
import {IndexedTask} from "./Task";


export class TaskEditorSuggest implements EditorSuggest<IndexedTask>{
  static taskLinePattern = /(-|\*) \[(\s|x)?\]/
  static pattern =  /(?:-|\*) \[(\s|x)?\]\s+[^\r\n]+(?!\|\|)$/gm;

  context: EditorSuggestContext | null;
  limit: number;
  app: App;

  constructor(app: App) {
    this.app = app;
  }

  close(): void {
  }

  getSuggestions(context: EditorSuggestContext): IndexedTask[] | Promise<IndexedTask[]> {
    // const search = context.query;
    return []
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

  renderSuggestion(value: IndexedTask, el: HTMLElement): void {
  }

  selectSuggestion(value: IndexedTask, evt: MouseEvent | KeyboardEvent): void {
  }

  setInstructions(instructions: Instruction[]): void {
  }
}