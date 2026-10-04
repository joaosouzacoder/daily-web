import { describe, expect, it } from 'vitest';
import { groupThreads } from '@/lib/emailGroups';
import { groupIntoThreads } from '@/lib/parsers/threads';
import type { EmailEnvelope } from '@/lib/types';

// As conversas vêm do mesmo montador que o painel usa, não de objetos à mão.
function envelope(over: Partial<EmailEnvelope>): EmailEnvelope {
  return {
    id: '1',
    account: 'mail-1',
    accountLabel: 'Trabalho',
    from: 'Milton Yoshida',
    subject: 'Assunto',
    unread: false,
    date: '2026-10-04T10:00:00',
    messageId: `<${over.id ?? '1'}@x>`,
    references: [],
    labels: [],
    mailbox: 'inbox',
    folder: 'INBOX',
    ...over,
  };
}

const NOW = new Date('2026-10-04T15:00:00');

function threads(envelopes: EmailEnvelope[]) {
  return groupIntoThreads(envelopes).sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

const keysOf = (groups: ReturnType<typeof groupThreads>) =>
  groups.map((g) => [g.label, g.threads.map((t) => t.subject)]);

describe('groupThreads', () => {
  it('sem agrupar devolve um grupo só, na ordem recebida', () => {
    const lista = threads([
      envelope({ id: '1', subject: 'A', date: '2026-10-04T10:00:00' }),
      envelope({ id: '2', subject: 'B', date: '2026-10-03T10:00:00' }),
    ]);
    const groups = groupThreads(lista, 'none', NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].threads).toBe(lista);
  });

  it('agrupa por conta com o nome que a pessoa deu à caixa', () => {
    const groups = groupThreads(
      threads([
        envelope({ id: '1', subject: 'A', account: 'mail-1', accountLabel: 'Trabalho' }),
        envelope({
          id: '2',
          subject: 'B',
          account: 'mail-2',
          accountLabel: 'Pessoal',
          date: '2026-10-04T09:00:00',
        }),
        envelope({
          id: '3',
          subject: 'C',
          account: 'mail-1',
          accountLabel: 'Trabalho',
          date: '2026-10-04T08:00:00',
        }),
      ]),
      'account',
      NOW,
    );
    expect(keysOf(groups)).toEqual([
      ['Trabalho', ['A', 'C']],
      ['Pessoal', ['B']],
    ]);
  });

  it('agrupa por remetente sem separar o mesmo nome em caixas diferentes', () => {
    const groups = groupThreads(
      threads([
        envelope({ id: '1', subject: 'A', from: 'GitHub' }),
        envelope({ id: '2', subject: 'B', from: 'github', date: '2026-10-04T09:00:00' }),
        envelope({ id: '3', subject: 'C', from: 'Luan', date: '2026-10-04T08:00:00' }),
      ]),
      'sender',
      NOW,
    );
    expect(keysOf(groups)).toEqual([
      ['GitHub', ['A', 'B']],
      ['Luan', ['C']],
    ]);
  });

  it('põe a conversa no grupo de quem escreveu por último, ignorando o que você enviou', () => {
    const groups = groupThreads(
      threads([
        envelope({ id: '1', subject: 'Proposta', from: 'Luan', messageId: '<raiz@x>' }),
        envelope({
          id: '2',
          subject: 'Re: Proposta',
          from: 'Milton',
          messageId: '<r1@x>',
          references: ['<raiz@x>'],
          date: '2026-10-04T11:00:00',
        }),
        envelope({
          id: '3',
          subject: 'Re: Proposta',
          from: 'Eu',
          mailbox: 'sent',
          folder: 'Sent',
          messageId: '<r2@x>',
          references: ['<raiz@x>', '<r1@x>'],
          date: '2026-10-04T12:00:00',
        }),
      ]),
      'sender',
      NOW,
    );
    expect(groups.map((g) => g.label)).toEqual(['Milton']);
  });

  it('agrupa por data em faixas relativas a hoje', () => {
    const groups = groupThreads(
      threads([
        envelope({ id: '1', subject: 'hoje', date: '2026-10-04T08:00:00' }),
        envelope({ id: '2', subject: 'ontem', date: '2026-10-03T23:00:00' }),
        envelope({ id: '3', subject: 'semana', date: '2026-09-29T10:00:00' }),
        envelope({ id: '4', subject: 'mês', date: '2026-09-10T10:00:00' }),
        envelope({ id: '5', subject: 'antigo', date: '2026-07-01T10:00:00' }),
      ]),
      'date',
      NOW,
    );
    expect(keysOf(groups)).toEqual([
      ['Hoje', ['hoje']],
      ['Ontem', ['ontem']],
      ['Últimos 7 dias', ['semana']],
      ['Últimos 30 dias', ['mês']],
      ['Mais antigos', ['antigo']],
    ]);
  });

  it('segue a ordenação escolhida: do mais antigo, a faixa antiga vem primeiro', () => {
    const lista = threads([
      envelope({ id: '1', subject: 'hoje', date: '2026-10-04T08:00:00' }),
      envelope({ id: '2', subject: 'antigo', date: '2026-07-01T10:00:00' }),
    ]).reverse();
    expect(groupThreads(lista, 'date', NOW).map((g) => g.label)).toEqual([
      'Mais antigos',
      'Hoje',
    ]);
  });

  it('manda data ilegível para "Mais antigos" em vez de quebrar', () => {
    const groups = groupThreads(
      threads([envelope({ id: '1', subject: 'sem data', date: 'lixo' })]),
      'date',
      NOW,
    );
    expect(groups.map((g) => g.label)).toEqual(['Mais antigos']);
  });

  it('não devolve grupo nenhum quando não há conversa', () => {
    expect(groupThreads([], 'account', NOW)).toEqual([]);
  });
});
