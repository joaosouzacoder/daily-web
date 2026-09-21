import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SlackPanel } from '@/components/SlackPanel';
import type { SlackDigest } from '@/lib/types';

const nav = vi.hoisted(() => ({ search: '', history: [] as string[] }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: (url: string) => {
      nav.history.push(url);
      nav.search = url.split('?')[1] ?? '';
    },
  }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const digest: SlackDigest = {
  team: 'Equipe',
  mentions: [{ id: 'C1:1', author: 'Ana', channel: '#geral', text: '<b>literal</b>', date: new Date().toISOString(), url: 'https://equipe.slack.com/archives/C1/p1' }],
  directs: [{ id: 'D1:2', author: 'Bia', channel: 'mensagem direta', text: 'Olá', date: new Date().toISOString(), url: '' }],
};

afterEach(() => {
  cleanup();
  nav.search = '';
  nav.history = [];
});

describe('SlackPanel', () => {
  it('mostra menções por padrão e grava a aba de diretas na URL', () => {
    const { rerender } = render(<SlackPanel slack={{ data: digest, error: null }} />);
    expect(screen.getByText('<b>literal</b>')).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /Mensagens diretas/ }));
    expect(nav.history.at(-1)).toBe('/?slack=diretas');
    nav.search = 'slack=diretas';
    rerender(<SlackPanel slack={{ data: digest, error: null }} />);
    expect(screen.getByText('Olá')).toBeInTheDocument();
  });

  it('valor desconhecido volta para menções e a aba padrão sai da URL', () => {
    nav.search = 'slack=outra&x=1';
    render(<SlackPanel slack={{ data: digest, error: null }} />);
    expect(screen.getByRole('tab', { name: /Menções/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: /Menções/ }));
    expect(nav.history.at(-1)).toBe('/?x=1');
  });

  it('cria link somente quando a mensagem tem permalink válido já filtrado', () => {
    render(<SlackPanel slack={{ data: digest, error: null }} />);
    expect(screen.getByRole('link', { name: /Ana/ })).toHaveAttribute(
      'href',
      'https://equipe.slack.com/archives/C1/p1',
    );
  });

  it('mostra estados vazio e de erro', () => {
    const empty: SlackDigest = { mentions: [], directs: [], team: '' };
    const { rerender } = render(<SlackPanel slack={{ data: empty, error: null }} />);
    expect(screen.getByText('Nenhuma menção nos últimos 7 dias.')).toBeInTheDocument();
    rerender(<SlackPanel slack={{ data: empty, error: 'Slack indisponível' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Slack indisponível');
  });
});
