import type { ReactNode } from 'react';
import { EmptyState as DataEmptyState } from '@/components/data/EmptyState';

/**
 * Shim during the migration: the old call sites pass a single `message`. Panels
 * are being moved to @/components/data/EmptyState, which takes title plus
 * description plus an action. Delete this file once no import remains.
 */
export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return <DataEmptyState title={message} action={action} />;
}
