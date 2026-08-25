import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  parseEnvelopes,
  sortRecentFirst,
  readable,
  parseMessageIdFromJson,
  stripMessageReadHeader,
} from '@/lib/parsers/himalaya';

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

  it('remove conteúdo oculto com display:none', () => {
    const html = '<div style="display:none">preheader text aqui</div><p>Conteúdo real</p>';
    expect(readable(html)).toBe('Conteúdo real');
  });

  it('separa células de tabela com quebras de linha', () => {
    const html = '<table><tr><td>Total</td><td>$50.00</td></tr></table>';
    expect(readable(html)).toBe('Total\n\n$50.00');
  });

  it('remove comentários HTML MSO', () => {
    const html = '<p>Início</p><!--[if mso]><style>table{}</style><![endif]--><p>Fim</p>';
    expect(readable(html)).toBe('Início\n\nFim');
  });

  it('remove bloco display:none mesmo com tag aninhada do mesmo nome dentro', () => {
    const html = '<div style="display:none">preview <div>nested</div> more hidden text should not leak</div><p>Real content</p>';
    expect(readable(html)).toBe('Real content');
  });
});

describe('parseMessageIdFromJson', () => {
  it('extrai o message_id de dentro dos headers da primeira part', () => {
    const json = JSON.stringify({
      parts: [
        {
          headers: [
            { name: { other: 'Delivered-To' }, value: { Text: 'a@b.com' } },
            { name: 'message_id', value: { Text: 'abc123@mail.example.com' } },
          ],
        },
      ],
    });
    expect(parseMessageIdFromJson(json)).toBe('abc123@mail.example.com');
  });

  it('devolve null quando não há header message_id', () => {
    const json = JSON.stringify({ parts: [{ headers: [] }] });
    expect(parseMessageIdFromJson(json)).toBeNull();
  });

  it('devolve null quando não há parts', () => {
    expect(parseMessageIdFromJson(JSON.stringify({}))).toBeNull();
  });
});

describe('stripMessageReadHeader', () => {
  it('remove o bloco de cabeçalho (Date/From/To/Subject) e o marcador da part', () => {
    const raw = [
      'Date: Tue, 25 Aug 2026 14:31:13 -0700',
      'From: GitHub <noreply@github.com>',
      'Subject: Assunto',
      '',
      '[1] text/plain (10 B)',
      '    Content-Type: text/plain; charset=UTF-8',
      '',
      'Corpo real aqui',
    ].join('\n');
    expect(stripMessageReadHeader(raw)).toBe('Corpo real aqui');
  });

  it('devolve o texto original quando não há marcador de part', () => {
    expect(stripMessageReadHeader('texto simples sem marcador')).toBe('texto simples sem marcador');
  });
});
