import {RRule} from "rrule";
import {EventRef, ListItemCache} from "obsidian";
import {TaskEvents} from "../Events/TaskEvents";
import {TaskModifiedData} from "../Events/types";
import {IndexedTask, TaskID, TaskLocation, taskLocationStr, taskLocFromStr} from "../Task";
import {emptyIndexedTask, taskIdToTid, taskTidToId} from "../Task/Task";

export interface LineTask extends ListItemCache {
  name: string;
  uid: number;
  complete: boolean;
  recurrence?: RRule;
  dueDate?: Date;
  tags: string[];
}

export type State = Record<string, LineTask>;

export const taskLocationFromLineTask = (lt: LineTask, path: string): TaskLocation => ({
  filePath: path,
  lineNumber: lt.position.start.line,
});

export const getIndexedTask = (
  lineTask: LineTask,
  r: Record<TaskID, IndexedTask>,
  nextId: number
): IndexedTask =>
  lineTask.uid > 0 && lineTask.uid in r && r[lineTask.uid] ||
  Object.values(r).find(rt => rt.name === lineTask.name) ||
  {...emptyIndexedTask(), uid: lineTask.uid || nextId};

export class TaskStore {
  private events: TaskEvents;
  private state: State;
  private static MIN_UID = 100000;
  private fileCacheRef: EventRef;

  constructor(taskEvents: TaskEvents) {
    this.events = taskEvents;
    this.fileCacheRef = this.events.onFileCacheUpdate(this.reducer.bind(this))
  }

  public unload() {
    this.events.off(this.fileCacheRef);
  }

  private reducer(fileState: State) {
    this.state = this.unifyState({
      ...this.state,
      ...fileState
    });
    this.update();
  }

  // ensures all tasks have the correct uids and tids
  // if ANY task with uid 0 has the same name as another, we update it to the other's uid
  public unifyState(state: State): State {
    const nameUidMap: Record<string, number> = Object.keys(state).reduce((ts, path) => {
      const t = state[path];
      return {
        ...ts,
        [t.name]: Math.max(ts[t.name], t.uid)
      }
    }, {} as Record<string, number>)

    return Object.keys(state).reduce((newState, path) => {
      return {
        ...newState,
        [path]: {
          ...state[path],
          uid: nameUidMap[state[path].name],
          id: taskIdToTid(nameUidMap[state[path].name])
        }
      }
    }, {} as State);
  }

  public taskRecordFromState(state: State): Record<TaskID, IndexedTask> {
    const uids = new Set(Object.values(state).filter(t => t.id).map(t => taskTidToId(t.id)));
    let nextId = Math.max(Math.max(...uids) + 1, TaskStore.MIN_UID);
    const rec: Record<TaskID, IndexedTask> = Object.keys(state).reduce((r, locStr) => {
      const lineTask = this.state[locStr];
      const idxTask = getIndexedTask(lineTask, r, nextId);
      if (idxTask.uid < TaskStore.MIN_UID) {
        idxTask.uid += TaskStore.MIN_UID;
      }
      idxTask.id = taskIdToTid(idxTask.uid)
      if (idxTask.uid === nextId) nextId++;
      state[locStr].uid = idxTask.uid;
      state[locStr].id = idxTask.id;
      return {
        ...r,
        [lineTask.uid]: {
          ...idxTask,
          complete: idxTask.complete || lineTask.complete,
        }
      }
    }, {} as Record<TaskID, IndexedTask>);

    for (const locStr in state) {
      const {filePath} = taskLocFromStr(locStr);
      const lineTask = state[locStr];
      const task = rec[lineTask.uid];
      const parentLine = lineTask.parent;
      const parent = state[taskLocationStr({filePath, lineNumber: parentLine})]
      if (parent) {
        rec[parent.uid] = {
          ...rec[parent.uid],
          childUids: [...rec[parent.uid].childUids, lineTask.uid]
        }
      }
      rec[lineTask.uid] = {
        ...task,
        locations: [...task.locations, taskLocationFromLineTask(lineTask, filePath)],
        parentUids: [...task.parentUids, ...[parent?.uid]].filter(x => x),
        parentLocations: [...task.parentLocations, ...[parent && taskLocationFromLineTask(parent, filePath)]].filter(x => x)
      }
    }
    return rec;
  }

  public taskLocations(state: State): Record<string, TaskID> {
    return Object.keys(state).reduce((lcs, locStr) => {
      return {
        ...lcs,
        [locStr]: lcs[locStr] || state[locStr].uid
      }
    }, {} as Record<string, TaskID>);
  }

  private update() {
    const index = this.taskRecordFromState(this.state);
    const locations = this.taskLocations(this.state);
    this.notifySubscribers({index, locations})
  }

  private notifySubscribers(data: TaskModifiedData) {
    this.events.triggerIndexUpdate(data)
  }
}