import { describe, expect, it, vi } from 'vitest';
import { notesChanged, NOTES_CHANGED_EVENT, onNotesChanged } from '@/lib/notesBus';

describe('aviso de notas mudadas', () => {
  it('entrega o aviso a quem está escutando', () => {
    const ouviu = vi.fn();
    const parar = onNotesChanged(ouviu);

    notesChanged();

    expect(ouviu).toHaveBeenCalledWith({});
    parar();
  });

  it('leva o id da nota a abrir', () => {
    const ouviu = vi.fn();
    const parar = onNotesChanged(ouviu);

    notesChanged({ activate: 'n-1' });

    expect(ouviu).toHaveBeenCalledWith({ activate: 'n-1' });
    parar();
  });

  it('parar de escutar realmente para', () => {
    const ouviu = vi.fn();
    onNotesChanged(ouviu)();

    notesChanged();

    expect(ouviu).not.toHaveBeenCalled();
  });

  it('avisar sem ninguém escutando não quebra', () => {
    expect(() => notesChanged()).not.toThrow();
  });

  // O nome do evento é o contrato com quem preferir disparar na mão.
  it('quem dispara o evento cru também é ouvido', () => {
    const ouviu = vi.fn();
    const parar = onNotesChanged(ouviu);

    window.dispatchEvent(new CustomEvent(NOTES_CHANGED_EVENT, { detail: { activate: 'n-2' } }));

    expect(ouviu).toHaveBeenCalledWith({ activate: 'n-2' });
    parar();
  });
});
