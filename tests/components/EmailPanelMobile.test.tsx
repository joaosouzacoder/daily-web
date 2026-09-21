import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { EmailPanel } from '@/components/EmailPanel';
import { CreateFromEmailMenu } from '@/components/email/CreateFromEmailMenu';
import type { EmailEnvelope, MailboxRef } from '@/lib/types';

const mailboxes: MailboxRef[] = [
  { id: 'mail-1', label: 'Trabalho' },
  { id: 'mail-2', label: 'Pessoal' },
];

const emails: EmailEnvelope[] = [
  {
    id: '1',
    account: 'mail-1',
    accountLabel: 'Trabalho',
    from: 'Milton',
    subject: 'Mensagem mais nova',
    unread: true,
    date: '2026-09-20T10:00:00Z',
    messageId: '<nova@x>',
    references: [],
    labels: [],
    mailbox: 'inbox',
    folder: 'INBOX',
  },
  {
    id: '2',
    account: 'mail-2',
    accountLabel: 'Pessoal',
    from: 'Ana',
    subject: 'Mensagem mais antiga',
    unread: false,
    date: '2026-09-19T10:00:00Z',
    messageId: '<antiga@x>',
    references: [],
    labels: [],
    mailbox: 'inbox',
    folder: 'INBOX',
  },
];

function montar() {
  render(
    <EmailPanel
      email={{ data: emails, error: null }}
      mailboxes={mailboxes}
      onChanged={() => {}}
      onSeenChanged={() => {}}
      onRemoved={() => {}}
    />,
  );
}

function abrirMenu(gatilho: HTMLElement) {
  fireEvent.pointerDown(gatilho, {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  });
  return screen.findByRole('menu');
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    if (String(input).includes('/api/email/folders')) {
      return new Response(JSON.stringify({ folders: ['Arquivo', 'Clientes'] }));
    }
    if (String(input).includes('/api/notes/folders')) {
      return new Response(JSON.stringify({ folders: [] }));
    }
    return new Response(JSON.stringify({ results: [] }));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('menus do painel de e-mail em tela estreita', () => {
  it('reúne as ações em lote no menu e usa os mesmos caminhos dos botões', async () => {
    montar();
    fireEvent.click(screen.getByLabelText('selecionar Mensagem mais nova'));

    const gatilho = screen.getByRole('button', { name: 'ações dos e-mails' });
    expect(gatilho).toHaveClass('lg:hidden');
    let menu = await abrirMenu(gatilho);

    expect(within(menu).getByText('1 conversa')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Marcar lido' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Marcar não lido' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Mover para' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Excluir' })).toBeInTheDocument();

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Marcar lido' }));
    await waitFor(() => {
      const pedido = vi
        .mocked(global.fetch)
        .mock.calls.find(([, init]) => String(init?.body).includes('"action":"read"'));
      expect(pedido).toBeDefined();
      expect(JSON.parse(String(pedido?.[1]?.body))).toMatchObject({
        targets: [{ account: 'mail-1', id: '1' }],
        action: 'read',
      });
    });

    fireEvent.click(screen.getByLabelText('selecionar Mensagem mais nova'));
    menu = await abrirMenu(gatilho);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Excluir' }));
    expect(await screen.findByText('Excluir este e-mail?')).toBeInTheDocument();
  });

  it('filtra e ordena pelo menu do cabeçalho', async () => {
    montar();
    const gatilho = screen.getByRole('button', { name: 'ações dos e-mails' });
    expect(screen.getByRole('button', { name: 'Não lidos' }).parentElement).toHaveClass(
      'hidden',
      'lg:contents',
    );
    expect(screen.getByLabelText('buscar e-mails').parentElement?.parentElement).toHaveClass(
      'w-full',
    );

    let menu = await abrirMenu(gatilho);
    fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'Só não lidos' }));
    expect(screen.queryByText('Mensagem mais antiga')).toBeNull();

    menu = await abrirMenu(gatilho);
    fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'Só não lidos' }));
    menu = await abrirMenu(gatilho);
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Mais antigos' }));
    const linhas = screen.getByRole('listbox', { name: 'conversas' }).querySelectorAll('.row');
    expect(linhas[0]).toHaveTextContent('Mensagem mais antiga');

    menu = await abrirMenu(gatilho);
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Pessoal' }));
    expect(screen.getByText('Mensagem mais antiga')).toBeInTheDocument();
    expect(screen.queryByText('Mensagem mais nova')).toBeNull();
  });

  it('move etiquetar e excluir da linha para o menu de três pontos', async () => {
    montar();
    const etiquetarInline = screen.getByRole('button', { name: 'etiquetar Mensagem mais nova' });
    const excluirInline = screen.getByRole('button', { name: 'excluir Mensagem mais nova' });
    const grupoDesktop = etiquetarInline.parentElement?.parentElement;
    expect(grupoDesktop).toBe(excluirInline.parentElement);
    expect(grupoDesktop).toHaveClass('hidden', 'lg:flex');

    const menu = await abrirMenu(
      screen.getByRole('button', { name: 'Ações de Mensagem mais nova' }),
    );
    const etiquetar = within(menu).getByText('Etiquetar');
    const excluir = within(menu).getByText('Excluir');
    expect(etiquetar).toHaveClass('lg:hidden');
    expect(excluir).toHaveClass('lg:hidden');

    etiquetar.focus();
    fireEvent.keyDown(etiquetar, { key: 'ArrowRight' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Clientes' }));
    await waitFor(() =>
      expect(
        vi
          .mocked(global.fetch)
          .mock.calls.some(([, init]) => String(init?.body).includes('"action":"tag"')),
      ).toBe(true),
    );

    const reaberto = await abrirMenu(
      screen.getByRole('button', { name: 'Ações de Mensagem mais nova' }),
    );
    fireEvent.click(within(reaberto).getByText('Excluir'));
    expect(await screen.findByText('Excluir este e-mail?')).toBeInTheDocument();
  });

  it('mantém o menu de criação igual quando não recebe ações estreitas', async () => {
    render(
      <CreateFromEmailMenu
        subject="Sem ações extras"
        folders={[]}
        busy={false}
        onCreate={() => {}}
      />,
    );

    const menu = await abrirMenu(screen.getByRole('button', { name: 'Ações de Sem ações extras' }));
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2);
    expect(within(menu).getByRole('menuitem', { name: 'Criar nota' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Criar tarefa' })).toBeInTheDocument();
    expect(within(menu).queryByText('Etiquetar')).toBeNull();
    expect(within(menu).queryByText('Excluir')).toBeNull();
  });
});
