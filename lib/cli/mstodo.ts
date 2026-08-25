import { runCli } from './run';
import { parseTasks } from '@/lib/parsers/mstodo';
import type { TodoTask, TaskPriority } from '@/lib/types';

export async function fetchTasks(): Promise<TodoTask[]> {
  const { stdout } = await runCli('mstodo', ['list']);
  return parseTasks(stdout);
}

export type Recur = 'none' | 'daily' | 'weekly' | 'monthly';

export interface EditTaskInput {
  title?: string;
  due?: string;
  time?: string;
  recur?: Recur;
  priority?: TaskPriority;
}

export function buildEditArgs(id: string, input: EditTaskInput): string[] {
  const args = [id];
  if (input.title !== undefined) args.push('--title', input.title);
  if (input.due !== undefined) args.push('--due', input.due);
  if (input.time !== undefined) args.push('--time', input.time);
  if (input.recur !== undefined) args.push('--recur', input.recur);
  if (input.priority !== undefined) args.push('--priority', input.priority);
  return args;
}

export async function addTask(title: string): Promise<string> {
  const { stdout } = await runCli('mstodo', ['add', title]);
  return stdout.trim();
}

export async function completeTask(id: string): Promise<void> {
  await runCli('mstodo', ['complete', id]);
}

export async function reopenTask(id: string): Promise<void> {
  await runCli('mstodo', ['reopen', id]);
}

export async function editTask(id: string, input: EditTaskInput): Promise<void> {
  await runCli('mstodo', ['edit', ...buildEditArgs(id, input)]);
}

export async function deleteTask(id: string): Promise<void> {
  await runCli('mstodo', ['delete', id]);
}

export async function addSubtask(taskId: string, title: string): Promise<void> {
  await runCli('mstodo', ['subtask', taskId, title]);
}

export async function editSubtask(taskId: string, itemId: string, title: string): Promise<void> {
  await runCli('mstodo', ['subtask-edit', taskId, itemId, title]);
}

export async function deleteSubtask(taskId: string, itemId: string): Promise<void> {
  await runCli('mstodo', ['subtask-delete', taskId, itemId]);
}

export async function checkSubtask(taskId: string, itemId: string, checked: boolean): Promise<void> {
  await runCli('mstodo', [checked ? 'check' : 'uncheck', taskId, itemId]);
}
