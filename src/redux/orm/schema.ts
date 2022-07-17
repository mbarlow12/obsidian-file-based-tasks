import { ORM, OrmState } from 'redux-orm';
import { OrmSession } from 'redux-orm/Session';
import { Tag, Task, TaskInstance } from './models';

export const schema = {
    Task,
    TaskInstance,
    Tag
};

export type TaskORMSchema = typeof schema;

export type TasksORMState = OrmState<TaskORMSchema>;

export type TasksORMSession = OrmSession<TaskORMSchema>;

export const fetchOrm = () => {
    const orm = new ORM<TaskORMSchema>();
    orm.register(Task, TaskInstance, Tag);
    const state = orm.getEmptyState();
    return { orm, state };
}