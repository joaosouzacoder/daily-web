import { getDb } from '@/lib/db';
import { isNotePaper, isPinColor, isPinShape } from '@/lib/api/validation';
import type { NotePaper, PinColor, PinShape } from '@/lib/types';

export interface BoardStyle {
  paper: NotePaper | null;
  pin: PinColor | null;
  pinShape: PinShape | null;
}

/** `undefined` keeps what is stored; `null` goes back to automatic. */
export interface BoardStylePatch {
  paper?: NotePaper | null;
  pin?: PinColor | null;
  pinShape?: PinShape | null;
}

interface Row {
  task_id: string;
  paper: string | null;
  pin: string | null;
  pin_shape: string | null;
}

const EMPTY: BoardStyle = { paper: null, pin: null, pinShape: null };

// The table has no CHECK, so a colour later removed from the palette (or a
// row written by hand) can still be there. It reads as automatic instead of
// reaching the page as a data-paper no stylesheet rule matches.
function clean(row: Omit<Row, 'task_id'>): BoardStyle {
  return {
    paper: isNotePaper(row.paper) ? row.paper : null,
    pin: isPinColor(row.pin) ? row.pin : null,
    pinShape: isPinShape(row.pin_shape) ? row.pin_shape : null,
  };
}

/** The colours this user chose, by task id. Tasks left automatic are absent. */
export function boardStyles(userId: string): Map<string, BoardStyle> {
  const rows = getDb()
    .prepare('SELECT task_id, paper, pin, pin_shape FROM task_board_style WHERE user_id = ?')
    .all(userId) as Row[];
  return new Map(rows.map((row) => [row.task_id, clean(row)]));
}

export function boardStyleOf(userId: string, taskId: string): BoardStyle {
  const row = getDb()
    .prepare('SELECT paper, pin, pin_shape FROM task_board_style WHERE user_id = ? AND task_id = ?')
    .get(userId, taskId) as Omit<Row, 'task_id'> | undefined;
  return row ? clean(row) : { ...EMPTY };
}

/**
 * Applies a partial change and returns the style that results. Read and write
 * share one transaction, so two quick picks (paper, then pin) cannot each
 * start from the old row and undo the other.
 */
export function setBoardStyle(userId: string, taskId: string, patch: BoardStylePatch): BoardStyle {
  const db = getDb();
  return db.transaction(() => {
    const current = boardStyleOf(userId, taskId);
    const next: BoardStyle = {
      paper: patch.paper === undefined ? current.paper : patch.paper,
      pin: patch.pin === undefined ? current.pin : patch.pin,
      pinShape: patch.pinShape === undefined ? current.pinShape : patch.pinShape,
    };
    // All automatic is the default, and the default is the absence of a row,
    // the same convention task_board_status follows.
    if (next.paper === null && next.pin === null && next.pinShape === null) {
      clearBoardStyle(userId, taskId);
      return next;
    }
    db.prepare(
      `INSERT INTO task_board_style (user_id, task_id, paper, pin, pin_shape, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, task_id)
       DO UPDATE SET paper = excluded.paper, pin = excluded.pin, pin_shape = excluded.pin_shape,
         updated_at = excluded.updated_at`,
    ).run(userId, taskId, next.paper, next.pin, next.pinShape, new Date().toISOString());
    return next;
  })();
}

export function clearBoardStyle(userId: string, taskId: string): void {
  getDb()
    .prepare('DELETE FROM task_board_style WHERE user_id = ? AND task_id = ?')
    .run(userId, taskId);
}
