import { describe, expect, it } from 'vitest';
import type { ListResponse } from 'imapflow';
import { findSpecialUse, mailConfig, usableFolders } from '@/lib/integrations/imap';
import type { Connection } from '@/lib/vault/connections';

function box(path: string, specialUse?: string, flags: string[] = []): ListResponse {
  return { path, specialUse, flags: new Set(flags) } as unknown as ListResponse;
}

function conn(values: Record<string, string>): Connection {
  return { id: 'c1', module: 'email', label: 'Trabalho', values };
}

describe('mailConfig', () => {
  it('resolve host e porta a partir do provedor escolhido', () => {
    const config = mailConfig(conn({ preset: 'gmail', user: 'a@b.com', password: 's' }));
    expect(config.imapHost).toBe('imap.gmail.com');
    expect(config.imapPort).toBe(993);
    expect(config.smtpHost).toBe('smtp.gmail.com');
  });

  it('usa o que foi digitado no modo manual', () => {
    const config = mailConfig(
      conn({ preset: 'custom', imapHost: 'imap.meu.com', imapPort: '143', user: 'a', password: 'b' }),
    );
    expect(config.imapHost).toBe('imap.meu.com');
    expect(config.imapPort).toBe(143);
  });

  it('recusa conexão sem host, dizendo qual conta é', () => {
    expect(() => mailConfig(conn({ preset: 'custom', user: 'a' }))).toThrow(/Trabalho/);
  });
});

describe('findSpecialUse', () => {
  // O nome da lixeira muda por provedor e por idioma; procurar por "Trash"
  // falharia numa conta em português.
  it('acha a lixeira pela flag, mesmo com o nome traduzido', () => {
    const list = [box('INBOX'), box('[Gmail]/Lixeira', '\\Trash')];
    expect(findSpecialUse(list, '\\Trash')).toBe('[Gmail]/Lixeira');
  });

  it('devolve null quando a conta não expõe a pasta', () => {
    expect(findSpecialUse([box('INBOX')], '\\Trash')).toBeNull();
  });
});

describe('usableFolders', () => {
  it('esconde as pastas de sistema em que não faz sentido arquivar', () => {
    const list = [
      box('INBOX'),
      box('[Gmail]/Enviados', '\\Sent'),
      box('[Gmail]/Rascunhos', '\\Drafts'),
      box('[Gmail]/Lixeira', '\\Trash'),
      box('Clientes'),
    ];
    expect(usableFolders(list)).toEqual(['INBOX', 'Clientes']);
  });

  it('ignora contêiner que não dá para selecionar', () => {
    const list = [box('INBOX'), box('[Gmail]', undefined, ['\\Noselect'])];
    expect(usableFolders(list)).toEqual(['INBOX']);
  });
});
