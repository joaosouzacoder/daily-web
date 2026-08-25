import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PullsPanel } from '@/components/PullsPanel';

afterEach(cleanup);

describe('PullsPanel', () => {
  it('renderiza cada linha do digest e transforma URLs em links', () => {
    render(
      <PullsPanel
        pulls={{
          data: { lines: ['daily-web', 'PR #3 https://github.com/joaosouzacoder/daily-web/pull/3'] },
          error: null,
        }}
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://github.com/joaosouzacoder/daily-web/pull/3');
  });

  it('mostra o erro do painel quando presente', () => {
    render(<PullsPanel pulls={{ data: { lines: [] }, error: 'ghpending falhou: sem token' }} />);
    expect(screen.getByRole('alert').textContent).toContain('sem token');
  });
});
