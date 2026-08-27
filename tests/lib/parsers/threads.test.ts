import { describe, expect, it } from 'vitest';
import { groupIntoThreads, normalizeSubject } from '@/lib/parsers/threads';
import type { EmailEnvelope } from '@/lib/types';

function mail(over: Partial<EmailEnvelope>): EmailEnvelope {
  return {
    id: '1',
    account: 'work',
    accountLabel: 'Work',
    from: 'Alguém',
    subject: 'assunto',
    unread: false,
    date: '2026-08-27T12:00:00Z',
    messageId: '<1@x>',
    references: [],
    ...over,
  };
}

describe('normalizeSubject', () => {
  it('tira os prefixos de resposta e encaminhamento', () => {
    for (const bruto of [
      'Re: teste assunto',
      'RE: teste assunto',
      'Res: teste assunto',
      'Fwd: teste assunto',
      'ENC: teste assunto',
      'Re: Re: Re: teste assunto',
      'Re: Fwd: teste assunto',
      'RE[2]: teste assunto',
      '  re:   teste assunto  ',
    ]) {
      expect(normalizeSubject(bruto), bruto).toBe('teste assunto');
    }
  });

  it('não come palavra que só começa parecido', () => {
    expect(normalizeSubject('Refatoração do build')).toBe('Refatoração do build');
    expect(normalizeSubject('Resultado da apuração')).toBe('Resultado da apuração');
    expect(normalizeSubject('Review: contrato')).toBe('Review: contrato');
  });

  it('aguenta assunto vazio', () => {
    expect(normalizeSubject('')).toBe('');
    expect(normalizeSubject('Re:')).toBe('');
  });
});

describe('groupIntoThreads', () => {
  it('junta a resposta com o original pelo In-Reply-To', () => {
    const threads = groupIntoThreads([
      mail({ id: '1', messageId: '<a@x>', subject: 'teste assunto', from: 'você' }),
      mail({ id: '2', messageId: '<b@x>', references: ['<a@x>'], subject: 'Re: teste assunto', from: 'Luan' }),
    ]);

    expect(threads).toHaveLength(1);
    expect(threads[0].messages.map((m) => m.id)).toEqual(['1', '2']);
    expect(threads[0].subject).toBe('teste assunto');
    expect(threads[0].participants).toEqual(['você', 'Luan']);
  });

  it('junta a conversa inteira, mesmo com a referência apontando só para o começo', () => {
    const threads = groupIntoThreads([
      mail({ id: '1', messageId: '<a@x>' }),
      mail({ id: '2', messageId: '<b@x>', references: ['<a@x>'] }),
      mail({ id: '3', messageId: '<c@x>', references: ['<a@x>', '<b@x>'] }),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0].messages).toHaveLength(3);
  });

  // A resposta pode chegar na lista antes do original, que é o caso normal
  // numa caixa ordenada por data decrescente.
  it('liga o fio independentemente da ordem de entrada', () => {
    const threads = groupIntoThreads([
      mail({ id: '2', messageId: '<b@x>', references: ['<a@x>'], date: '2026-08-27T13:00:00Z' }),
      mail({ id: '1', messageId: '<a@x>', date: '2026-08-27T12:00:00Z' }),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0].messages.map((m) => m.id)).toEqual(['1', '2']);
  });

  // Nem todo cliente preserva o header; o assunto é o resgate.
  it('junta pelo assunto quando a referência se perdeu', () => {
    const threads = groupIntoThreads([
      mail({ id: '1', messageId: '<a@x>', subject: 'teste assunto' }),
      mail({ id: '2', messageId: '<b@x>', subject: 'Re: teste assunto' }),
    ]);
    expect(threads).toHaveLength(1);
  });

  // Duas caixas diferentes podem ter um "Reunião" cada, sem relação nenhuma.
  it('não junta pelo assunto entre contas diferentes', () => {
    const threads = groupIntoThreads([
      mail({ id: '1', account: 'work', messageId: '<a@x>', subject: 'Reunião' }),
      mail({ id: '2', account: 'pessoal', messageId: '<b@x>', subject: 'Re: Reunião' }),
    ]);
    expect(threads).toHaveLength(2);
  });

  // Mas a referência é vínculo explícito e vale mesmo entre contas: é o mesmo
  // fio recebido nas duas caixas.
  it('junta entre contas quando a referência diz que é o mesmo fio', () => {
    const threads = groupIntoThreads([
      mail({ id: '1', account: 'work', messageId: '<a@x>' }),
      mail({ id: '2', account: 'pessoal', messageId: '<b@x>', references: ['<a@x>'] }),
    ]);
    expect(threads).toHaveLength(1);
  });

  it('separa assuntos diferentes', () => {
    const threads = groupIntoThreads([
      mail({ id: '1', messageId: '<a@x>', subject: 'Nota fiscal' }),
      mail({ id: '2', messageId: '<b@x>', subject: 'Reunião' }),
    ]);
    expect(threads).toHaveLength(2);
  });

  // Newsletters chegam sem assunto útil e sem referência; agrupá-las por
  // "assunto vazio" juntaria coisas sem relação nenhuma.
  it('não junta mensagens sem assunto', () => {
    const threads = groupIntoThreads([
      mail({ id: '1', messageId: '<a@x>', subject: '' }),
      mail({ id: '2', messageId: '<b@x>', subject: '' }),
    ]);
    expect(threads).toHaveLength(2);
  });

  it('compara Message-Id sem depender dos sinais nem da caixa', () => {
    const threads = groupIntoThreads([
      mail({ id: '1', messageId: '<A@X>', subject: 'um' }),
      mail({ id: '2', messageId: '<b@x>', references: ['a@x'], subject: 'outro' }),
    ]);
    expect(threads).toHaveLength(1);
  });

  it('conta os não lidos e guarda a data mais recente', () => {
    const threads = groupIntoThreads([
      mail({ id: '1', messageId: '<a@x>', unread: false, date: '2026-08-27T12:00:00Z' }),
      mail({ id: '2', messageId: '<b@x>', references: ['<a@x>'], unread: true, date: '2026-08-27T15:00:00Z' }),
      mail({ id: '3', messageId: '<c@x>', references: ['<a@x>'], unread: true, date: '2026-08-27T14:00:00Z' }),
    ]);
    expect(threads[0].unreadCount).toBe(2);
    expect(threads[0].lastDate).toBe('2026-08-27T15:00:00Z');
  });

  it('não repete quem escreveu mais de uma vez', () => {
    const threads = groupIntoThreads([
      mail({ id: '1', messageId: '<a@x>', from: 'Luan' }),
      mail({ id: '2', messageId: '<b@x>', references: ['<a@x>'], from: 'Luan' }),
      mail({ id: '3', messageId: '<c@x>', references: ['<a@x>'], from: 'você' }),
    ]);
    expect(threads[0].participants).toEqual(['Luan', 'você']);
  });

  it('devolve vazio para lista vazia', () => {
    expect(groupIntoThreads([])).toEqual([]);
  });

  it('uma mensagem sozinha é uma conversa de uma', () => {
    const threads = groupIntoThreads([mail({ id: '1' })]);
    expect(threads).toHaveLength(1);
    expect(threads[0].messages).toHaveLength(1);
  });

  // Duas mensagens distintas podem trazer o mesmo Message-Id (reenvio, bug de
  // cliente). Elas são o mesmo fio, e nenhuma pode sumir da lista.
  it('não perde mensagem com Message-Id repetido', () => {
    const threads = groupIntoThreads([
      mail({ id: '1', messageId: '<a@x>', subject: 'um' }),
      mail({ id: '2', messageId: '<a@x>', subject: 'outro' }),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0].messages.map((m) => m.id).sort()).toEqual(['1', '2']);
  });

  it('não perde nenhuma mensagem, seja qual for o agrupamento', () => {
    const entrada = [
      mail({ id: '1', messageId: '<a@x>', subject: 'A' }),
      mail({ id: '2', messageId: '<b@x>', references: ['<a@x>'], subject: 'Re: A' }),
      mail({ id: '3', messageId: '<c@x>', subject: 'B' }),
      mail({ id: '4', messageId: '', subject: '' }),
      mail({ id: '5', messageId: '<e@x>', references: ['<inexistente@x>'], subject: 'C' }),
    ];
    const saida = groupIntoThreads(entrada).flatMap((t) => t.messages);
    expect(saida.map((m) => m.id).sort()).toEqual(['1', '2', '3', '4', '5']);
  });
});
