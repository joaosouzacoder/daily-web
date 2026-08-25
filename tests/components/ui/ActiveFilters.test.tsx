import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ActiveFilters } from '@/components/ui/ActiveFilters';

afterEach(cleanup);

describe('ActiveFilters', () => {
  it('não renderiza nada quando não há filtro ativo', () => {
    const { container } = render(
      <ActiveFilters filters={[]} onRemove={() => {}} onClearAll={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('remove um filtro individual pelo id', () => {
    const onRemove = vi.fn();
    render(
      <ActiveFilters
        filters={[{ id: 'unread', label: 'não lidos' }]}
        onRemove={onRemove}
        onClearAll={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'remover filtro não lidos' }));
    expect(onRemove).toHaveBeenCalledWith('unread');
  });

  it('mostra limpar tudo só com mais de um filtro ativo', () => {
    const { rerender } = render(
      <ActiveFilters filters={[{ id: 'a', label: 'a' }]} onRemove={() => {}} onClearAll={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: 'Limpar tudo' })).toBeNull();

    rerender(
      <ActiveFilters
        filters={[
          { id: 'a', label: 'a' },
          { id: 'b', label: 'b' },
        ]}
        onRemove={() => {}}
        onClearAll={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Limpar tudo' })).toBeInTheDocument();
  });
});
