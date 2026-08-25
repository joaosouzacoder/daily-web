import { runCli } from './run';
import { parseTasks } from '@/lib/parsers/mstodo';
import type { TodoTask } from '@/lib/types';

export async function fetchTasks(): Promise<TodoTask[]> {
  const { stdout } = await runCli('mstodo', ['list']);
  return parseTasks(stdout);
}
