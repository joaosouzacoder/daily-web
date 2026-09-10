'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  /** Defaults to a plain "Confirmar"; name the actual act instead where you can. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Paints the confirm button as destructive. Deleting something is the case. */
  destructive?: boolean;
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/**
 * An in-app replacement for window.confirm.
 *
 * The native dialog cannot be styled, cannot be tested through the DOM, blocks
 * the whole tab, and on some platforms is suppressed entirely — a destructive
 * action that silently never asks is worse than one that asks badly.
 *
 * Keyboard is the point, not a bonus: Escape cancels, Enter confirms from
 * anywhere inside, and focus lands on the confirm button when it opens so the
 * gesture is one key either way.
 */
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setPending({ ...options, resolve });
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setPending(null);
  }, []);

  const dialog = (
    <Dialog
      open={pending !== null}
      // Covers Escape and the overlay click in one place: anything that closes
      // the dialog without the confirm button is a "no".
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            settle(true);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{pending?.title}</DialogTitle>
          {pending?.description && <DialogDescription>{pending.description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          {/* Cancel comes first and is the quiet one: the destructive act should
              never be the button your hand lands on by habit. */}
          <Button type="button" variant="outline" onClick={() => settle(false)}>
            {pending?.cancelLabel ?? 'Cancelar'}
          </Button>
          <Button
            type="button"
            autoFocus
            variant={pending?.destructive ? 'destructive' : 'default'}
            onClick={() => settle(true)}
          >
            {pending?.confirmLabel ?? 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirm, dialog };
}
