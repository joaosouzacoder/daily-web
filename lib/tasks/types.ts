import type { TaskPriority } from '@/lib/types';

export type Recur = 'none' | 'daily' | 'weekly' | 'monthly' | '';

export interface EditTaskInput {
  title?: string;
  due?: string;
  time?: string;
  recur?: Recur;
  priority?: TaskPriority;
}
