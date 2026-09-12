import { describe, expect, it, beforeEach } from 'vitest';
import {
  IDEMPOTENCY_WINDOW_MS,
  recentCreation,
  rememberCreation,
  resetCreationsForTests,
  senderLabel,
  subjectTitle,
  taskTitleFrom,
} from '@/lib/email/fromEmail';
import { addressLabel } from '@/lib/integrations/imap';

describe('quem escreveu', () => {
  // O nome é o que se reconhece numa lista de tarefas; o endereço só aparece
  // quando o remetente não mandou nome nenhum.
  it('usa o nome quando ele existe', () => {
    expect(addressLabel({ name: 'Milton Yoshida', address: 'milton@x.com' })).toBe(
      'Milton Yoshida',
    );
  });

  it('cai no endereço quando não há nome', () => {
    expect(addressLabel({ address: 'cobranca@banco.com' })).toBe('cobranca@banco.com');
  });

  it('cai no endereço quando o nome vem só com espaço', () => {
    expect(addressLabel({ name: '   ', address: 'no-reply@x.com' })).toBe('no-reply@x.com');
  });

  it('não quebra quando não veio remetente nenhum', () => {
    expect(addressLabel(undefined)).toBe('');
    expect(senderLabel('')).toBe('remetente desconhecido');
  });
});

describe('título', () => {
  it('usa o assunto', () => {
    expect(subjectTitle('  Revisão do  PR #481 ')).toBe('Revisão do PR #481');
  });

  it('diz que não há assunto em vez de ficar sem título', () => {
    expect(subjectTitle('   ')).toBe('(sem assunto)');
  });

  // A tarefa leva o assunto e quem escreveu, e nada do corpo.
  it('junta assunto e remetente no título da tarefa', () => {
    expect(taskTitleFrom('Contrato', 'Milton Yoshida')).toBe('Contrato — Milton Yoshida');
  });

  it('usa o endereço no título quando não há nome', () => {
    expect(taskTitleFrom('Fatura', 'cobranca@banco.com')).toBe('Fatura — cobranca@banco.com');
  });
});

describe('clique repetido', () => {
  const origem = {
    userId: 'u-1',
    account: 'mail-1',
    folder: 'INBOX',
    uid: '42',
    kind: 'note' as const,
  };

  beforeEach(() => resetCreationsForTests());

  it('não conhece uma origem nova', () => {
    expect(recentCreation(origem)).toBeNull();
  });

  // O duplo envio sai antes de a primeira resposta voltar: o bloqueio da tela
  // sozinho não o alcança.
  it('devolve o que já foi criado dentro da janela', () => {
    rememberCreation(origem, 'nota-1');
    expect(recentCreation(origem)).toBe('nota-1');
  });

  it('esquece depois da janela: pedir de novo amanhã é um pedido novo', () => {
    const agora = Date.now();
    rememberCreation(origem, 'nota-1', agora);
    expect(recentCreation(origem, agora + IDEMPOTENCY_WINDOW_MS + 1)).toBeNull();
  });

  it('separa nota de tarefa na mesma mensagem', () => {
    rememberCreation(origem, 'nota-1');
    expect(recentCreation({ ...origem, kind: 'task' })).toBeNull();
  });

  it('separa mensagens diferentes', () => {
    rememberCreation(origem, 'nota-1');
    expect(recentCreation({ ...origem, uid: '43' })).toBeNull();
  });

  // Nada cresce sem limite: o que envelheceu sai do mapa sozinho.
  it('descarta o que envelheceu', () => {
    const agora = Date.now();
    rememberCreation({ ...origem, uid: '1' }, 'a', agora);
    rememberCreation({ ...origem, uid: '2' }, 'b', agora + IDEMPOTENCY_WINDOW_MS + 2);
    expect(recentCreation({ ...origem, uid: '1' }, agora + IDEMPOTENCY_WINDOW_MS + 2)).toBeNull();
    expect(recentCreation({ ...origem, uid: '2' }, agora + IDEMPOTENCY_WINDOW_MS + 2)).toBe('b');
  });
});
