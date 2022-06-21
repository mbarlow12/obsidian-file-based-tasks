import { values } from 'lodash';
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
import { TaskStoreState } from './Store/types';
import { Task } from "./Task";


export class TaskEditorSuggest extends EditorSuggest<Task>{
  static taskLinePattern = /(-|\*) \[(\s|x)?\]/
  static textPattern = /[-*] \[ \] (?<taskName>[\w ]+)/;

  context: EditorSuggestContext | null;
  limit: number;
  app: App;
  taskState: TaskStoreState;

  private events: TaskEvents;
  private indexUpdateEventRef: EventRef;

  constructor(app: App, events: TaskEvents, taskState: TaskStoreState) {
    super(app);
    this.app = app;
    this.events = events;
    this.taskState = taskState;
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
    const tasks = values(this.taskState.taskIndex).filter(t => t.name.startsWith(searchText));

    return [...tasks.slice(0, 5)]
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line);
    if (!line.match(TaskEditorSuggest.taskLinePattern))
      return null;

    const match = line.match(TaskEditorSuggest.textPattern);
    if (match && match.groups?.taskName?.length >= 3) {
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

  // open(): void {
  // }

  renderSuggestion(value: Task, el: HTMLElement): void {
    const elem = new HTMLElement();
    elem.setAttr('tag', 'p');
    elem.innerText = value.name;
    el.appendChild(elem);
  }

  selectSuggestion(value: Task, evt: MouseEvent | KeyboardEvent): void {
  }

  setInstructions(instructions: Instruction[]): void {
  }
}