import { runCli } from './run';
import { parseTasks } from '@/lib/parsers/mstodo';
import { providerEnv } from '@/lib/vault/env';
import type { TodoTask, TaskPriority } from '@/lib/types';

export async function fetchTasks(userId: string): Promise<TodoTask[]> {
  const { stdout } = await runCli('mstodo', ['list'], { env: providerEnv(userId, 'mstodo') });
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

export async function addTask(userId: string, title: string): Promise<string> {
  const { stdout } = await runCli('mstodo', ['add', title], { env: providerEnv(userId, 'mstodo') });
  return stdout.trim();
}

export async function completeTask(userId: string, id: string): Promise<void> {
  await runCli('mstodo', ['complete', id], { env: providerEnv(userId, 'mstodo') });
}

export async function reopenTask(userId: string, id: string): Promise<void> {
  await runCli('mstodo', ['reopen', id], { env: providerEnv(userId, 'mstodo') });
}

export async function editTask(userId: string, id: string, input: EditTaskInput): Promise<void> {
  await runCli('mstodo', ['edit', ...buildEditArgs(id, input)], { env: providerEnv(userId, 'mstodo') });
}

export async function deleteTask(userId: string, id: string): Promise<void> {
  await runCli('mstodo', ['delete', id], { env: providerEnv(userId, 'mstodo') });
}

export async function addSubtask(userId: string, taskId: string, title: string): Promise<void> {
  await runCli('mstodo', ['subtask', taskId, title], { env: providerEnv(userId, 'mstodo') });
}

export async function editSubtask(userId: string, taskId: string, itemId: string, title: string): Promise<void> {
  await runCli('mstodo', ['subtask-edit', taskId, itemId, title], { env: providerEnv(userId, 'mstodo') });
}

export async function deleteSubtask(userId: string, taskId: string, itemId: string): Promise<void> {
  await runCli('mstodo', ['subtask-delete', taskId, itemId], { env: providerEnv(userId, 'mstodo') });
}

export async function checkSubtask(userId: string, taskId: string, itemId: string, checked: boolean): Promise<void> {
  await runCli('mstodo', [checked ? 'check' : 'uncheck', taskId, itemId], { env: providerEnv(userId, 'mstodo') });
}
