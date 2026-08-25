import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Section } from '@/components/ui/Section';

afterEach(cleanup);

describe('Section', () => {
  it('renderiza o rótulo eyebrow como cabeçalho acessível', () => {
    render(<Section eyebrow="Inbox">conteúdo</Section>);
    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
  });

  it('mostra o contador quando fornecido', () => {
    render(
      <Section eyebrow="Inbox" count="12 de 34">
        conteúdo
      </Section>,
    );
    expect(screen.getByText('12 de 34')).toBeInTheDocument();
  });

  it('renderiza as ações do cabeçalho', () => {
    render(
      <Section eyebrow="Tarefas" actions={<button>nova tarefa</button>}>
        conteúdo
      </Section>,
    );
    expect(screen.getByRole('button', { name: 'nova tarefa' })).toBeInTheDocument();
  });
});
