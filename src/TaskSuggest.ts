import {
  App,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  EventRef,
  Instruction,
  TFile
} from "obsidian";
import { TaskEvents } from './Events/TaskEvents';
import { TaskParser } from './Parser/TaskParser';
import { TaskStoreState } from './Store/types';
import { Task } from "./Task";


export class TaskEditorSuggest extends EditorSuggest<Task>{
  static pat = /^\s*[-*] \[(?<complete>\s|x)?]\s+/;
  static taskLinePattern = /^[ \t]*[-*] \[[ x]?]/
  static textPattern = /^[ \t]*[-*] \[[ x]?][ \t]+(?<taskName>(?:\d|\w).*)(?!\^[\w\d]+$)/;

  context: EditorSuggestContext | null;
  limit: number;
  app: App;
  taskState: TaskStoreState;

  private events: TaskEvents;
  private indexUpdateEventRef: EventRef;
  private parser: TaskParser;

  constructor(app: App, events: TaskEvents, taskState: TaskStoreState) {
    super(app);
    this.app = app;
    this.events = events;
    this.taskState = taskState;
    this.parser = new TaskParser();
    this.subscribe();
  }

  subscribe() {
    this.indexUpdateEventRef = this.events.registerIndexUpdatedHandler(this.updateState.bind(this));
  }

  unsubscribe() {
    this.events.off(this.indexUpdateEventRef);
  }

  updateState(state: TaskStoreState) {
    this.taskState = state;
  }

  // close(): void {
  // }

  getSuggestions(context: EditorSuggestContext): Task[] | Promise<Task[]> {
    const searchText = context.query;
    const tasks = [...this.taskState.taskIndex.values()].filter(t => t.name.startsWith(searchText));

    return [...tasks.slice(0, 5)]
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line);
    const parsedTask = this.parser.parseLine(line);
    if (
        parsedTask &&
        parsedTask.uid === 0 &&
        !parsedTask.tags?.length &&
        !parsedTask.recurrence &&
        !parsedTask.dueDate &&
        !parsedTask.links &&
        parsedTask.name?.length > 1
    ) {

      console.log('matched name: ' + parsedTask.name);
      const start = line.indexOf(parsedTask.name);
      return {
        start: {
          line: cursor.line,
          ch: start
        },
        end: cursor,
        query: parsedTask.name.trim()
      }
    }

    return null;
  }

  // open(): void {
  // }

  renderSuggestion(value: Task, el: HTMLElement): void {
    const base = createDiv();
    base.createDiv({
      text: value.name,
      cls: 'my-cool-class'
    });
    el.appendChild(base);
  }

  selectSuggestion(value: Task, evt: MouseEvent | KeyboardEvent): void {
  }

  setInstructions(instructions: Instruction[]): void {
  }
}