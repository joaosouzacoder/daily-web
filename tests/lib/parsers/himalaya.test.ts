import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnvelopes, sortRecentFirst, readable, parseMessageId } from '@/lib/parsers/himalaya';

const fixture = readFileSync(
  path.join(__dirname, '../../fixtures/himalaya-envelopes.json'),
  'utf8',
);

describe('parseEnvelopes', () => {
  it('marca como lido quando a flag Seen está presente', () => {
    const items = parseEnvelopes(fixture, 'work');
    expect(items[0].unread).toBe(false);
  });

  it('marca como não lido quando falta a flag Seen', () => {
    const items = parseEnvelopes(fixture, 'work');
    expect(items[1].unread).toBe(true);
  });

  it('usa o endereço quando o nome do remetente está vazio', () => {
    const items = parseEnvelopes(fixture, 'work');
    expect(items[1].from).toBe('no-reply@github.com');
  });

  it('trata subject nulo como string vazia', () => {
    const items = parseEnvelopes(fixture, 'work');
    expect(items[1].subject).toBe('');
  });

  it('marca a conta de origem em cada item', () => {
    const items = parseEnvelopes(fixture, 'personal');
    expect(items.every((i) => i.account === 'personal')).toBe(true);
  });
});

describe('sortRecentFirst', () => {
  it('ordena do mais recente para o mais antigo', () => {
    const items = parseEnvelopes(fixture, 'work');
    const sorted = sortRecentFirst([...items].reverse());
    expect(sorted[0].id).toBe('143');
  });
});

describe('readable', () => {
  it('devolve texto puro sem alteração além de colapsar linhas em branco', () => {
    expect(readable('linha 1\n\n\n\nlinha 2')).toBe('linha 1\n\nlinha 2');
  });

  it('converte HTML simples em texto legível', () => {
    const html = '<html><body><p>Olá</p><p>Segunda linha</p></body></html>';
    expect(readable(html)).toBe('Olá\n\nSegunda linha');
  });

  it('remove conteúdo de <script> e <style>', () => {
    const html = '<html><head><style>.a{color:red}</style></head><body><p>Texto</p><script>alert(1)</script></body></html>';
    expect(readable(html)).toBe('Texto');
  });

  it('decodifica entidades HTML acentuadas', () => {
    const html = '<p>Escritório &amp; equipe</p>';
    expect(readable(html)).toBe('Escritório & equipe');
  });
});

describe('parseMessageId', () => {
  it('extrai o Message-ID sem os colchetes', () => {
    const raw = 'Message-ID: <abc123@mail.example.com>\n\ncorpo aqui';
    expect(parseMessageId(raw)).toBe('abc123@mail.example.com');
  });

  it('devolve null quando não há header', () => {
    expect(parseMessageId('sem header aqui')).toBeNull();
  });
});
