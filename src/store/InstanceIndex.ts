import { SerializedITask, SerializedITaskInstance, TaskSerializer } from "./orm/types";
import { OldTask } from "task/types";
import { OldTaskInstance } from "task/types";

export class InstanceIndex {
    private instances: SerializedITaskInstance[]
    private index: Record<number, number>
    
    fetchInstanceById(id: number): OldTaskInstance {
        return this.fetchInstanceByIndex(this.index[id]);
    }
    
    fetchInstances(ids: number[]): OldTaskInstance[] {
        return ids.map( id => this.fetchInstanceById(id) );
    }

    private fetchInstanceByIndex(idx: number): OldTaskInstance {
        return this.deserializeITaskInstance(this.instances[idx]);
    }

    serializeITask({
        id,
        name,
        complete,
        tags,
        completed,
        content,
        created,
        parentIds,
        childIds,
        dueDate,
        instances
    } : OldTask): SerializedITask {
        return [
            id,
            name,
            complete,
            tags,
            completed,
            content,
            created,
            parentIds,
            childIds,
            dueDate || null,
            instances.map( inst => this.index[inst.id])
        ];
    }

    deserializeITask([
        id,
        name,
        complete,
        tags,
        completed,
        content,
        created,
        parentIds,
        childIds,
        dueDate,
        instanceIdxs
    ]: SerializedITask): OldTask {
       return {
        id,
        name,
        complete,
        tags,
        completed,
        content,
        created,
        parentIds,
        childIds,
        dueDate,
        instances: instanceIdxs.map( i => this.deserializeITaskInstance(this.instances[i]) )
       } 
    }
    
    serializeITaskInstance({
        id,
        name,
        complete,
        tags,
        completed,
        rawText,
        filePath,
        line,
        parentLine,
        parentInstance,
        childLines,
        instanceChildren,
        dueDate,
        links,
    }: OldTaskInstance): SerializedITaskInstance {
        return [
            id,
            name,
            complete,
            tags,
            completed,
            rawText,
            filePath,
            line,
            parentLine,
            this.index[parentInstance.id],
            childLines,
            instanceChildren.map( child => this.index[child.id] ), 
            dueDate,
            links
        ]
    }

    deserializeITaskInstance([
        id,
        name,
        complete,
        tags,
        completed,
        rawText,
        filePath,
        line,
        parentLine,
        parentInstanceIdx,
        childLines,
        instanceChildrenIdxs,
        dueDate,
        links,
    ]: SerializedITaskInstance): OldTaskInstance {
        return {
            id,
            name,
            complete,
            tags,
            completed,
            rawText,
            filePath,
            line,
            parentLine,
            parentInstance: this.fetchInstanceByIndex(parentInstanceIdx),
            childLines,
            instanceChildren: instanceChildrenIdxs.map( idx => this.fetchInstanceByIndex(idx) ),
            dueDate,
            links,
        }
    }
}